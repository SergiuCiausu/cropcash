import { describe, expect, it } from 'vitest';
import { renderReport } from '../src/report/daily.ts';
import type { ProblemSource } from '../src/store.ts';
import { MemoryStore } from './memory-store.ts';

const quiet = { date: '2026-11-08', checked: 3, requests: 3, bytes: 0, pendingLinks: 0, events: [] };

function problem(overrides: Partial<ProblemSource> = {}): ProblemSource {
  return {
    institution: 'DAJ',
    title: 'DAJ Buzău',
    url: 'https://dadrbz.madr.ro/',
    state: 'error',
    failureCount: 3,
    reason: 'server_error: HTTP 500',
    ...overrides,
  };
}

describe('source health in the report', () => {
  it('groups problems by state, worst first, with the reason', () => {
    const report = renderReport({
      ...quiet,
      problems: [problem({ state: 'needs_manual', failureCount: 0, reason: null }), problem({ state: 'gone', failureCount: 0 }), problem()],
    });
    expect(report).toContain('## Starea surselor (3 cu probleme)');
    expect(report.indexOf('### Dispărute (1)')).toBeLessThan(report.indexOf('### Cu erori (1)'));
    expect(report.indexOf('### Cu erori (1)')).toBeLessThan(report.indexOf('### De verificat manual (1)'));
    expect(report).toContain('server_error: HTTP 500 (eșecuri la rând: 3)');
  });

  it('keeps the quiet-day message when only old problems exist', () => {
    const report = renderReport({ ...quiet, problems: [problem()] });
    expect(report).toContain('Nu s-a schimbat nimic.');
    expect(report).toContain('## Starea surselor');
  });

  it('adds nothing when every source is fine', () => {
    expect(renderReport({ ...quiet, problems: [] })).toBe(renderReport(quiet));
  });

  it('comes after what changed today', () => {
    const report = renderReport({ ...quiet, digest: ['## Oportunități pentru fermieri', ''], problems: [problem()] });
    expect(report.indexOf('Oportunități')).toBeLessThan(report.indexOf('Starea surselor'));
  });
});

describe('problemSources', () => {
  it('lists sources in a problem state, with the reason for that state', async () => {
    const store = new MemoryStore();
    const bad = store.add('https://a.ro/');
    const good = store.add('https://b.ro/');
    await store.updateSource(bad.id, { state: 'blocked' });
    await store.updateSource(good.id, { state: 'active' });
    await store.addEvent({ sourceId: bad.id, runId: 1, kind: 'error', detail: 'veche' });
    await store.addEvent({ sourceId: bad.id, runId: 2, kind: 'blocked', detail: 'CAPTCHA' });

    const problems = await store.problemSources();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ url: 'https://a.ro/', state: 'blocked', reason: 'CAPTCHA' });
  });
});
