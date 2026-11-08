/* The frame around a page: the lime rail with its tabs and farm box on a computer, the top bar and
   bottom tabs on a phone. Same classes as the real one, so it lines up at every width. */
import type { ReactNode } from 'react';
import { TABS } from '../../lib/ui/nav';
import { Bone, BoneText } from './Bone';

/** tabs: which tabs to draw; the onboarding steps pass their own. */
export default function RailSkeleton({ tabs = TABS, children }: { tabs?: readonly { railOnly?: true }[]; children: ReactNode }) {
  return (
    <>
      <header className="m-top field">
        <Bone w={36} h={36} r={10} className="on-field" />
        <Bone w={104} h={40} r={14} className="on-field" />
      </header>
      <div className="shell">
        <aside className="rail field">
          <span className="sk-logo">
            <Bone w={28} h={28} r={8} className="on-field" />
            <Bone w={84} h={16} className="on-field" />
          </span>
          <nav>
            {tabs.map((t, i) => (
              <span key={i} className={`sk-tab${t.railOnly ? ' rail-only' : ''}`}>
                <Bone w={20} h={20} r={6} className="on-field" />
                <Bone w={72} h={12} className="on-field sk-tab-label" />
              </span>
            ))}
            {/* "Mai mult": shown on a phone only, like the real one. */}
            {tabs === TABS && (
              <span className="sk-tab more-tab">
                <Bone w={20} h={20} r={6} className="on-field" />
                <Bone w={72} h={12} className="on-field sk-tab-label" />
              </span>
            )}
          </nav>
          <div className="farm glass sk-farm">
            <BoneText lines={3} h={11} />
          </div>
        </aside>
        <div className="main">
          <div>{children}</div>
        </div>
      </div>
    </>
  );
}
