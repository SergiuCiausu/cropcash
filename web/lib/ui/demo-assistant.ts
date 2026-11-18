/* Ion's farm has no account, so "Întreabă" can't ask the model. It shows prepared questions instead,
   answered on the phone by the same read functions the assistant's cards use. No figure is written
   here: each one comes from Ion's plan. Works offline and never calls the API. */
import type { AppData } from '../../../packages/shared/src/data/index';
import type { StoredFarm } from '../../../packages/shared/src/farm/index';
import { ASSISTANT_CARDS, parseCard, type AssistantCard, type CardType } from '../../../packages/shared/src/functions/cards';
import type { FarmPlan } from '../../../packages/shared/src/functions/plan';
import { findRead } from '../../../packages/shared/src/functions/registry';

export const DEMO_QUESTIONS: { question: string; answer: string; card: CardType }[] = [
  { question: 'Cât poate scoate Ion pe lună?', answer: 'Atât poate scoate Ion lunar, fără să rămână fără bani până la următoarea plată.', card: 'salary' },
  { question: 'Care sunt lunile grele?', answer: 'Acestea sunt lunile în care lui Ion îi ies mai mulți bani decât îi intră.', card: 'tight_months' },
  { question: 'Ce urmează la fermă?', answer: 'Acestea sunt următoarele plăți, termene și lucrări din planul lui Ion.', card: 'upcoming' },
];

export interface DemoContext {
  farm: StoredFarm;
  plan: FarmPlan;
  data: AppData;
  today: string;
}

/** The card for a prepared question, or none when the plan has nothing to show for it. */
export function demoCard(type: CardType, ctx: DemoContext): AssistantCard | null {
  const result = findRead(ASSISTANT_CARDS[type].fn)!.execute({}, ctx).data;
  return result === null ? null : parseCard(type, result);
}
