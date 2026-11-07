import { t } from '../i18n';

export type Tab = 'money' | 'calendar';

const TABS: { id: Tab; icon: string }[] = [
  { id: 'money', icon: '💰' },
  { id: 'calendar', icon: '📅' },
];

/** Bottom navigation: one tab per question the farmer asks (docs/06). */
export function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      aria-label="Meniu"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-field-900/10 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => (
          <li key={tab.id} className="flex-1">
            <button
              onClick={() => onChange(tab.id)}
              aria-current={active === tab.id ? 'page' : undefined}
              className={`flex w-full flex-col items-center gap-0.5 py-3 text-base ${
                active === tab.id ? 'font-bold text-field-700' : 'text-field-900/70'
              }`}
            >
              <span aria-hidden className="text-2xl">
                {tab.icon}
              </span>
              {t(`tabs.${tab.id}`)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
