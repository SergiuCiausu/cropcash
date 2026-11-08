'use client';
/* Recharts, loaded once and only when a chart is on screen. Null until it arrives, and for good if
   it can't load: each chart draws its own plain SVG until then. */
import { useEffect, useState } from 'react';

export type Recharts = typeof import('recharts');

let recharts: Promise<Recharts> | null = null;

export function useRecharts(): Recharts | null {
  const [R, setR] = useState<Recharts | null>(null);
  useEffect(() => {
    let live = true;
    (recharts ??= import('recharts')).then((m) => live && setR(m)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return R;
}
