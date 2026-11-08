'use client';
/* What comes next (list_upcoming): payments, deadlines and farm work, with the titles the calendar uses. */
import { loadData } from '../../../packages/shared/src/data/index';
import type { CardData } from '../../../packages/shared/src/functions/cards';
import { date } from '../../lib/cc/format';
import { Money } from '../app/bits';

type Entry = CardData<'upcoming'>[number];
const SHOWN = 6;

function titleOf(e: Entry, data: ReturnType<typeof loadData>): string {
  const crop = e.cropId ? (data.crops.crops.find((c) => c.id === e.cropId)?.name_ro ?? e.cropId) : '';
  switch (e.kind) {
    case 'apia_advance':
      return 'Avansul de la APIA';
    case 'apia_balance':
      return 'Restul de la APIA';
    case 'crop_sale':
      return `Vinzi ${crop.toLowerCase()}`;
    case 'input_cost':
      return e.what ? `${crop}: ${e.what}` : crop;
    case 'credit':
      return 'Primești creditul';
    case 'loan_repayment':
      return 'Dai înapoi creditul';
    default:
      return data.calendar.events.find((x) => x.id === e.eventId)?.title_ro ?? 'Termen';
  }
}

export function UpcomingCard({ data: entries }: { data: CardData<'upcoming'> }) {
  const data = loadData();
  const shown = entries.slice(0, SHOWN);
  return (
    <>
      <p className="eyebrow">Ce urmează</p>
      <ul className="ask-list">
        {shown.map((e) => (
          <li key={`${e.id}:${e.date}`}>
            <span className="ask-list-when">
              {e.window && e.window.start !== e.window.end ? `${date(e.window.start)} – ${date(e.window.end)}` : date(e.date)}
              {e.estimated && <small>dată estimată</small>}
            </span>
            <span className="ask-list-what">{titleOf(e, data)}</span>
            {e.value > 0 && e.direction !== 'none' && (
              <span className={e.direction === 'out' ? 'ask-list-sum out' : 'ask-list-sum'}>
                {e.direction === 'out' ? '−' : '+'}
                <Money bani={e.value} />
              </span>
            )}
          </li>
        ))}
      </ul>
      {entries.length > SHOWN && <p className="ask-card-note">Și încă {entries.length - SHOWN}. Toate sunt în Calendar.</p>}
    </>
  );
}
