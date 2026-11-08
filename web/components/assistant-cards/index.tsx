'use client';
/* The cards under an assistant answer (packages/shared/src/functions/cards.ts). The API filled them
   from read functions; here each one is checked again, because a conversation saved in this tab can
   be older than the app. A card that doesn't check out says so instead of drawing wrong figures. */
import type { ComponentType } from 'react';
import { parseCard, type AssistantCard, type CardData, type CardType } from '../../../packages/shared/src/functions/cards';
import { CreditCard } from './CreditCard';
import { MonthsCard } from './MonthsCard';
import { PensionCard } from './PensionCard';
import { PensionChangeCard } from './PensionChangeCard';
import { PurchaseCard } from './PurchaseCard';
import { SalaryCard } from './SalaryCard';
import { SubsidyCard } from './SubsidyCard';
import { TightMonthsCard } from './TightMonthsCard';
import { UpcomingCard } from './UpcomingCard';

/** One component per card type: a type added in cards.ts without one is a type error here. */
const RENDERERS: { [T in CardType]: ComponentType<{ data: CardData<T> }> } = {
  purchase: PurchaseCard,
  salary: SalaryCard,
  months: MonthsCard,
  tight_months: TightMonthsCard,
  subsidy: SubsidyCard,
  credit: CreditCard,
  upcoming: UpcomingCard,
  pension: PensionCard,
  pension_change: PensionChangeCard,
};

const LABELS: Record<CardType, string> = {
  purchase: 'Ce schimbă o cumpărătură',
  salary: 'Salariul',
  months: 'Lunile care vin',
  tight_months: 'Lunile grele',
  subsidy: 'Subvenția',
  credit: 'Ce schimbă un credit',
  upcoming: 'Ce urmează',
  pension: 'Pensia',
  pension_change: 'Ce schimbă pensia',
};

export function AssistantCardView({ type, data }: { type: unknown; data: unknown }) {
  const card = parseCard(type, data);
  if (!card) {
    return (
      <section className="ask-msg card ask-card">
        <p className="ask-card-note">Nu pot arăta cardul. Răspunsul e în textul de mai sus.</p>
      </section>
    );
  }
  const View = RENDERERS[card.type] as ComponentType<{ data: AssistantCard['data'] }>;
  return (
    <section className="ask-msg card ask-card" aria-label={LABELS[card.type]}>
      <View data={card.data} />
    </section>
  );
}

/** Every card of one answer, in the order the assistant showed them. Anything, as it came from the API or this tab's storage. */
export function AssistantCards({ cards }: { cards: unknown }) {
  if (!Array.isArray(cards) || !cards.length) return null;
  return (
    <>
      {cards.map((c: unknown, i) => {
        const { type, data } = (c && typeof c === 'object' ? c : {}) as { type?: unknown; data?: unknown };
        return <AssistantCardView key={i} type={type} data={data} />;
      })}
    </>
  );
}
