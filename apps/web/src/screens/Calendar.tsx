import { loadData, type MonthPlan, type Timeline, type TimelineEntry } from '@cropcash/shared';
import { t } from '../i18n';
import { formatDayMonth, formatLei, formatMonth, formatMonthYear } from '../lib/format';
import { VerifyBadge } from '../components/ui';

const data = loadData();
const cropName = (id?: string) => data.crops.crops.find((c) => c.id === id)?.name_ro ?? '';
const eventTitle = (id?: string) => data.calendar.events.find((e) => e.id === id)?.title_ro ?? '';

function entryTitle(e: TimelineEntry): string {
  switch (e.kind) {
    case 'apia_advance':
    case 'apia_balance':
      return t(`calendar.entry.${e.kind}`);
    case 'crop_sale':
      return t('calendar.entry.crop_sale', { crop: t(`calendar.cropAcc.${e.cropId}`) });
    case 'input_cost':
      return t('calendar.entry.input_cost', { crop: cropName(e.cropId), what: e.what ?? '' });
    default:
      return eventTitle(e.eventId);
  }
}

function Entry({ e }: { e: TimelineEntry }) {
  const isMoney = e.direction !== 'none';
  const icon = e.direction === 'in' ? '↓' : e.direction === 'out' ? '↑' : e.kind === 'deadline' ? '📄' : '🚜';
  const color = e.direction === 'in' ? 'text-field-700' : e.direction === 'out' ? 'text-red-800' : '';

  return (
    <li className="flex gap-3 py-2">
      <span aria-hidden className={`w-6 shrink-0 text-center text-xl ${color}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-lg leading-snug">
            {entryTitle(e)}
            {e.unverified && <VerifyBadge />}
          </p>
          {isMoney && (
            <span className={`shrink-0 text-lg font-semibold ${color}`}>
              {e.direction === 'in' ? '+' : '−'}
              {formatLei(e.value)}
            </span>
          )}
        </div>
        {!isMoney && (
          <p className="text-base text-field-900/70">
            {e.kind === 'deadline'
              ? t('calendar.until', { date: formatDayMonth(e.date) })
              : t('calendar.from', { date: formatDayMonth(e.window?.start ?? e.date) })}
          </p>
        )}
        {isMoney && e.window && (
          <p className="text-base text-field-900/70">
            {t('calendar.windowNote', {
              start: formatDayMonth(e.window.start),
              end: formatDayMonth(e.window.end),
              chosen: formatDayMonth(e.date),
            })}
          </p>
        )}
        {e.estimated && <p className="text-sm text-field-900/60">{t('calendar.estimated')}</p>}
      </div>
    </li>
  );
}

function Month({ m }: { m: MonthPlan }) {
  return (
    <section
      aria-label={formatMonthYear(m.key)}
      className={`rounded-2xl p-4 shadow-sm ${m.hard ? 'border-2 border-amber-400 bg-amber-50' : 'bg-white'}`}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{formatMonthYear(m.key)}</h2>
        {m.hard && (
          <span className="rounded-full bg-amber-200 px-3 py-1 text-sm font-semibold text-amber-950">
            {t('calendar.hardBadge')}
          </span>
        )}
      </header>
      {m.entries.length > 0 && <ul className="mt-1 divide-y divide-field-900/10">{m.entries.map((e) => <Entry key={e.id} e={e} />)}</ul>}
      <p className={`mt-2 text-right text-base ${m.balanceEnd < 0 ? 'font-semibold text-red-800' : 'text-field-900/70'}`}>
        {m.balanceEnd < 0
          ? t('calendar.missing', { amount: formatLei(-m.balanceEnd, 100) })
          : t('calendar.left', { amount: formatLei(m.balanceEnd, 100) })}
      </p>
    </section>
  );
}

export function CalendarScreen({ timeline }: { timeline: Timeline }) {
  const hard = timeline.hardMonths;
  const low = timeline.lowest;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">{t('calendar.title')}</h1>

      <div className={`rounded-2xl p-4 ${hard.length ? 'bg-amber-100' : 'bg-field-600/10'}`}>
        {hard.length > 0 ? (
          <>
            <p className="text-xl font-semibold">
              {hard.length === 1
                ? t('calendar.hardTitleOne', { month: formatMonth(hard[0]!) })
                : t('calendar.hardTitle', { from: formatMonth(hard[0]!), to: formatMonth(hard.at(-1)!) })}
            </p>
            <p className="mt-1 text-lg">
              {low.balance < 0
                ? t('calendar.lowMissing', { month: formatMonth(low.key), amount: formatLei(-low.balance, 100) })
                : t('calendar.lowLeft', { month: formatMonth(low.key), amount: formatLei(low.balance, 100) })}
            </p>
          </>
        ) : (
          <p className="text-xl">{t('calendar.noHard')}</p>
        )}
      </div>

      {timeline.months.map((m) => (
        <Month key={m.key} m={m} />
      ))}

      <p className="text-base text-field-900/70">{t('calendar.assumption')}</p>
    </div>
  );
}
