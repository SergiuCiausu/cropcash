'use client';
/* The "Total | Pe hectar" switch (docs/per-ha-total-plan.md). On a form it changes the unit one figure
   is typed in. On a results card it is one choice for every card at once, kept on the phone like the
   currency, so it works offline and Ion's example farm keeps its own. */
import { useCallback, useContext, useSyncExternalStore } from 'react';
import { RESULTS_BASIS_KEY, basisEcho, basisWords, isBasis, loadBasis, saveBasis, shownBani, type Basis, type BasisKind } from '../../lib/cc/basis';
import { useMoney } from '../../lib/cc/react';
import { browserStore } from '../../lib/cc/storage';
import { storageKey } from '../../lib/paths';
import { FrameContext } from './context';

/* Every card listens here, so a flip on one card flips them all in the same render. */
const listeners = new Set<() => void>();
/* Kept for this visit too, for a phone that refuses storage (private window). */
const visit = new Map<string, Basis>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  const fromOtherTab = (e: StorageEvent) => e.key?.includes('basis') && fn();
  addEventListener('storage', fromOtherTab);
  return () => {
    listeners.delete(fn);
    removeEventListener('storage', fromOtherTab);
  };
}
function readChoice(key: string): Basis {
  try {
    return loadBasis(browserStore(), key) ?? visit.get(key) ?? 'total';
  } catch {
    return visit.get(key) ?? 'total';
  }
}

/** The results cards' choice, and the formatter that follows it. */
export function useResultsBasis() {
  const { mode } = useContext(FrameContext);
  const key = storageKey(RESULTS_BASIS_KEY, mode);
  const basis = useSyncExternalStore(
    subscribe,
    () => readChoice(key),
    () => 'total' as Basis,
  );
  const money = useMoney();
  const setBasis = useCallback(
    (b: Basis) => {
      /* Kept for this visit only when the phone refused it, so cleared storage (sign-out) isn't shadowed. */
      let kept = false;
      try {
        kept = saveBasis(browserStore(), key, b);
      } catch {
        kept = false;
      }
      if (kept) visit.delete(key);
      else visit.set(key, b);
      listeners.forEach((fn) => fn());
    },
    [key],
  );
  /** An amount for the whole area, or per hectare when that's picked. `ari` 0 keeps the total. */
  const show = useCallback(
    (bani: number, ari: number, as: 'lei' | 'signed' = 'lei') => {
      const s = shownBani(bani, ari, basis);
      return `${money[as](s.bani)}${s.perHa ? '/ha' : ''}`;
    },
    [basis, money],
  );
  return { basis, setBasis, show, perHa: basis === 'ha' };
}

/** Two chips. `why` turns them off and says why (no hectares to split by). */
export function BasisSwitch({ kind = 'lei', basis, onChange, label, why }: { kind?: BasisKind; basis: Basis; onChange: (b: Basis) => void; label: string; why?: string | null }) {
  const words = basisWords(kind);
  return (
    <div className="basis-switch">
      <div className="chips" role="group" aria-label={label}>
        {(['total', 'ha'] as const).map((b) => (
          <button key={b} type="button" className="chip" aria-pressed={b === basis} disabled={!!why} onClick={() => b !== basis && onChange(b)}>
            {words[b]}
          </button>
        ))}
      </div>
      {why && <small className="basis-why">{why}</small>}
    </div>
  );
}

/** The switch in a results card's header. */
export function ResultsBasisSwitch() {
  const { basis, setBasis } = useResultsBasis();
  return <BasisSwitch basis={basis} onChange={setBasis} label="Arată sumele" />;
}

/** Under a field: the figure in both units, as it will be saved. */
export function BasisEcho({ text, kind = 'lei', basis, ari, saved }: { text: string; kind?: BasisKind; basis: Basis; ari: number; saved: Basis }) {
  return (
    <small className="amount-echo" aria-live="polite">
      {basisEcho(text, kind, basis, ari, saved)}
    </small>
  );
}

export { isBasis, type Basis };
