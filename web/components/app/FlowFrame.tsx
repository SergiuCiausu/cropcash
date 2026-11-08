'use client';
/* The frame of login and onboarding: the lime sidebar lists the steps (pills on a phone), and the
   page sits in a card. No tabs, no harvest, no assistant: there's no farm yet. */
import type { ReactNode } from 'react';
import type { IconName } from '../../lib/ui/icons';
import { Icon } from './bits';
import { Logo } from './Frame';

export interface FlowStep {
  id: string;
  label: string;
  icon: IconName;
  current: boolean;
  /** On a phone: a shorter label, and a number instead of the icon. */
  short?: string;
  pill?: string;
  /** "now", "done" or "next", for onboarding's step styles. */
  state?: string;
  /** A step that can't be picked yet. */
  disabled?: boolean;
}

export function FlowFrame({ label, steps, onPick, aside, children }: { label: string; steps: FlowStep[]; onPick: (id: string) => void; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="app ob-flow">
      <div className="shell">
        <aside className="rail field">
          <Logo />
          <nav aria-label={label}>
            {steps.map((s) => (
              <button key={s.id} type="button" className={s.state ? `ob-s ${s.state}` : 'ob-s'} disabled={s.disabled} aria-current={s.current ? (s.state ? 'step' : 'page') : undefined} onClick={() => !s.current && onPick(s.id)}>
                <Icon name={s.icon} />
                <span>{s.label}</span>
              </button>
            ))}
          </nav>
          {aside}
        </aside>
        <header className="m-top field">
          <span className="logo">
            <span className="mark">
              <Icon name="sprout" />
            </span>
          </span>
          <nav aria-label={label} className="ob-pills">
            {steps.map((s) => (
              <button key={s.id} type="button" className={s.state} disabled={s.disabled} aria-current={s.current ? (s.state ? 'step' : 'page') : undefined} onClick={() => !s.current && onPick(s.id)}>
                <span className="n">{s.pill ?? <Icon name={s.icon} />}</span>
                {s.short ?? s.label}
              </button>
            ))}
          </nav>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
