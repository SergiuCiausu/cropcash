import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type Anthropic from '@anthropic-ai/sdk';
import { loadData } from '@cropcash/shared';
import { assistantTools, createAssistant, type Assistant, type MessagesClient } from './ai/assistant';
import { createApp } from './app';
import type { FarmRow, Repo } from './db/repo';
import type { ReadOutcome } from './routes/functions';

const data = loadData();

const farm: FarmRow = {
  id: 'farm-1',
  name: 'Ion',
  county: 'TR',
  birth_year: data.subsidies.meta.campaign_year - 55,
  start_balance_bani: 3_500_000,
  parcels: [
    { crop_id: 'grau', area_ari: 800, is_arable: true },
    { crop_id: 'porumb', area_ari: 700, is_arable: true },
  ],
};

/** A fake Claude: answers each request with the next scripted message, and keeps what it was sent. */
function scripted(...replies: Partial<Anthropic.Beta.BetaMessage>[]) {
  const sent: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const client: MessagesClient = {
    beta: {
      messages: {
        create: vi.fn(async (params) => {
          sent.push(structuredClone(params));
          const next = replies.shift();
          if (!next) throw new Error('no more scripted replies');
          return { content: [], stop_reason: 'end_turn', ...next } as Anthropic.Beta.BetaMessage;
        }),
      },
    },
  };
  return { client, sent };
}

const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input }) as Anthropic.Beta.BetaToolUseBlock;
const text = (t: string) => ({ type: 'text', text: t, citations: null }) as Anthropic.Beta.BetaTextBlock;
const okRead = (value: unknown): ReadOutcome => ({ ok: true, result: { data: value, asOf: '2026-11-07', unverified: ['P1'], sources: [{ title: 'APIA', url: 'https://apia.org.ro' }] } });

describe('assistant tools', () => {
  const { tools } = assistantTools();
  const names = tools.map((t) => t.name);

  it('gives every tool an object schema', () => {
    for (const t of tools) expect(t.input_schema.type).toBe('object');
  });

  it('offers reads and the safe writes, never Stripe money, undo or demo controls', () => {
    expect(names).toEqual(expect.arrayContaining(['get_salary', 'check_purchase', 'list_tasks', 'record_sale', 'add_expense']));
    for (const hidden of ['start_pension', 'change_pension', 'stop_pension', 'undo_transaction', 'read_document', 'advance_clock', 'simulate_apia_advance', 'update_farm']) {
      expect(names).not.toContain(hidden);
    }
  });
});

describe('the assistant loop', () => {
  it('runs reads, turns a write into a card, and answers', async () => {
    const { client, sent } = scripted(
      {
        stop_reason: 'tool_use',
        content: [
          toolUse('t1', 'get_salary', { scenario: 'medium' }),
          toolUse('t2', 'add_expense', { category: 'diesel', amountLei: 300, date: '2026-11-07' }),
        ],
      },
      { content: [text('Salariul tău e 850 lei. Verifică cardul și apasă „Da, salvează”.')] },
    );
    const runRead = vi.fn(async (_fn: unknown, _input: unknown) => okRead({ salary: 85_000 }));
    const ask = createAssistant({ client, model: 'claude-opus-5-5' });
    const out = await ask({ turns: [{ role: 'user', text: 'Am cheltuit 300 de lei pe motorină. Cât am salariu?' }], today: '2026-11-07', runRead });

    expect(out.reply).toContain('850 lei');
    expect(out.actions).toEqual([{ function: 'add_expense', input: { category: 'diesel', amountLei: 300, date: '2026-11-07' } }]);
    expect(out.sources).toEqual([{ title: 'APIA', url: 'https://apia.org.ro' }]);
    expect(out.unverified).toEqual(['P1']);
    // The write never ran: only the read reached the runner.
    expect(runRead).toHaveBeenCalledTimes(1);
    expect(runRead.mock.calls[0]![0]).toMatchObject({ name: 'get_salary' });
    // Both results go back in one message, and today's date travels with the question.
    const second = sent[1]!.messages;
    const results = second.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.map((r) => r.tool_use_id)).toEqual(['t1', 't2']);
    expect(JSON.stringify(sent[0]!.messages[0])).toContain('Azi este 2026-11-07.');
  });

  it('turns a crop name into its id on a card, and drops a clientId the model made up', async () => {
    const { client } = scripted(
      { stop_reason: 'tool_use', content: [toolUse('t1', 'record_sale', { cropId: 'Grâu', date: '2026-11-07', totalLei: 500, clientId: '33333333-3333-4333-8333-333333333333' })] },
      { content: [text('Verifică cardul.')] },
    );
    const crops = [{ id: 'grau', name_ro: 'Grâu' }];
    const out = await createAssistant({ client, model: 'm', crops })({ turns: [{ role: 'user', text: 'Am vândut grâu de 500 lei' }], today: '2026-11-07', runRead: vi.fn() });
    expect(out.actions).toEqual([{ function: 'record_sale', input: { cropId: 'grau', date: '2026-11-07', totalLei: 500 } }]);
  });

  it('sends a bad write back as an error instead of a card', async () => {
    const { client, sent } = scripted(
      { stop_reason: 'tool_use', content: [toolUse('t1', 'record_sale', { cropId: 'grau', date: '2026-11-07' })] },
      { content: [text('Câți bani ai primit?')] },
    );
    const out = await createAssistant({ client, model: 'm' })({ turns: [{ role: 'user', text: 'Am vândut grâu' }], today: '2026-11-07', runRead: vi.fn() });
    expect(out.actions).toEqual([]);
    const result = (sent[1]!.messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[])[0]!;
    expect(result.is_error).toBe(true);
  });

  it('answers plainly on a refusal, with no figures or cards', async () => {
    const { client } = scripted({ stop_reason: 'refusal', content: [] });
    const out = await createAssistant({ client, model: 'm' })({ turns: [{ role: 'user', text: '?' }], today: '2026-11-07', runRead: vi.fn() });
    expect(out.reply).toMatch(/^Nu pot răspunde/);
    expect(out.actions).toEqual([]);
  });

  it('stops after a fixed number of steps', async () => {
    const loop = Array.from({ length: 20 }, (_, i) => ({ stop_reason: 'tool_use' as const, content: [toolUse(`t${i}`, 'get_salary', {})] }));
    const { client } = scripted(...loop);
    const out = await createAssistant({ client, model: 'm' })({ turns: [{ role: 'user', text: '?' }], today: '2026-11-07', runRead: async () => okRead(1) });
    expect(out.reply).toMatch(/prea mult/);
    expect(vi.mocked(client.beta.messages.create).mock.calls.length).toBe(8);
  });
});

describe('POST /api/assistant', () => {
  const repo = { getMyFarm: vi.fn(async (token: string) => (token === 'good' ? structuredClone(farm) : null)) } as unknown as Repo;
  const verifyToken = async (token: string) => {
    if (!token.startsWith('good')) throw new Error('bad token');
    return { userId: `user-${token}` };
  };
  const app = (assistant?: Assistant, assistantDailyLimit = 40) =>
    createApp({ corsOrigins: [], verifyToken, repo, data, now: () => new Date('2026-11-07T10:00:00Z'), assistant, assistantDailyLimit });
  const ask = (a: ReturnType<typeof app>, messages: unknown, token = 'good') =>
    request(a).post('/api/assistant').set('Authorization', `Bearer ${token}`).send({ messages });
  const question = [{ role: 'user', text: 'Cât pot cheltui?' }];

  it('needs a session', async () => {
    expect((await request(app()).post('/api/assistant').send({ messages: question })).status).toBe(401);
  });

  it('answers 503 without an Anthropic key', async () => {
    expect((await ask(app(), question)).status).toBe(503);
  });

  it('refuses a conversation that does not end with the farmer', async () => {
    const res = await ask(app(vi.fn()), [...question, { role: 'assistant', text: 'Salut' }]);
    expect(res.status).toBe(400);
  });

  it('answers 404 before onboarding', async () => {
    expect((await ask(app(vi.fn()), question, 'good-no-farm')).status).toBe(404);
  });

  it('runs reads on the farmer\'s own plan', async () => {
    const assistant: Assistant = async ({ runRead, today }) => {
      const { findRead } = await import('@cropcash/shared');
      const salary = await runRead(findRead('get_salary')!, { scenario: 'medium' });
      return { reply: `${today} ${salary.ok}`, sources: [], unverified: [], actions: [] };
    };
    const res = await ask(app(assistant), question);
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('2026-11-07 true');
  });

  it('stops at the daily limit', async () => {
    const a = app(async () => ({ reply: 'ok', sources: [], unverified: [], actions: [] }), 2);
    expect((await ask(a, question)).status).toBe(200);
    expect((await ask(a, question)).status).toBe(200);
    expect((await ask(a, question)).status).toBe(429);
  });

  it('hides the error when the model call fails', async () => {
    const res = await ask(app(async () => { throw new Error('secret detail'); }), question);
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});
