'use client';
/* After a save, say so, and say what it did to the salary (F-13). */
import { useCallback, useContext } from 'react';
import { viewFor } from '../../lib/cc/plan';
import { useMoney, useStore } from '../../lib/cc/react';
import type { FarmStore } from '../../lib/cc/store';
import { storageKey, type Mode } from '../../lib/paths';
import { salaryEffectText, type ToastInput } from '../../lib/ui/messages';
import { FrameContext } from './context';

const FLASH = 'cropcash-flash';
const QUEUED = 'Se trimite când ai internet.';

/** Read from the store, not from a render: the page may have started over by the time the save ends. */
function salaryNow(store: FarmStore): number | null {
  const farm = store.getState().farm;
  if (!farm?.baseFarm) return null;
  try {
    const view = viewFor(farm, 'farm');
    return view.closed ? null : view.farmPlan().monthlySalary;
  } catch {
    return null;
  }
}

/** The message a page left before moving on to another one, once. */
export function takeFlash(mode: Mode): ToastInput | null {
  try {
    const key = storageKey(FLASH, mode);
    const saved = sessionStorage.getItem(key);
    if (saved) sessionStorage.removeItem(key);
    return saved ? (JSON.parse(saved) as ToastInput) : null;
  } catch {
    return null;
  }
}

/**
 * Wraps a save. When it ends well, a toast names what happened and the salary it left; a save waiting
 * for internet says that instead. `nextPage`: the page is about to reload, so the next one shows it.
 * A failed save throws as before, and the caller shows the error.
 */
export function useSaved() {
  const store = useStore();
  const money = useMoney();
  const { notify, mode } = useContext(FrameContext);
  return useCallback(
    async (title: string, action: () => unknown, nextPage = false) => {
      const before = store ? salaryNow(store) : null;
      const waiting = () => store?.getState().farm?.outbox.length ?? 0;
      const waitedBefore = waiting();
      await action();
      const queued = waiting() > waitedBefore;
      const note: ToastInput = { tone: 'good', title, body: queued ? QUEUED : money.text(salaryEffectText(before, store ? salaryNow(store) : null)) };
      if (!nextPage) return notify(note);
      try {
        sessionStorage.setItem(storageKey(FLASH, mode), JSON.stringify(note));
      } catch {
        /* Private mode: the new figures on the next page still show that it saved. */
      }
    },
    [store, money, notify, mode],
  );
}
