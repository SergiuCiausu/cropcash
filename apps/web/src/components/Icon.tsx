/* Line icons from the team prototype (farm-app/index.html). 24×24, stroke-based. */
const PATHS = {
  home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z"/><path d="M9.5 20.5V14h5v6.5"/>',
  bars: '<path d="M5 20v-7M12 20V5M19 20v-10"/>',
  sprout:
    '<path d="M12 21v-9"/><path d="M12 12C12 8 9 5.5 4.5 5.5 4.5 10 7.5 12 12 12Z"/><path d="M12 14c0-3.5 2.5-6 7.5-6 0 4.5-3 6-7.5 6Z"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6Z"/><path d="m9 12 2.2 2.2L15.2 10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  cal: '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  drop: '<path d="M12 3.5c3.5 4.5 6 7.5 6 10.5a6 6 0 0 1-12 0c0-3 2.5-6 6-10.5Z"/>',
  seed: '<path d="M12 21c-4-2-6.5-6-6.5-10S8 4 12 3c4 1 6.5 4 6.5 8s-2.5 8-6.5 10Z"/><path d="M12 8v9"/>',
  land: '<path d="M3 18c4-4 8-4 18 0"/><path d="M3 13c5-4 10-4 18 1"/><path d="M12 9V4M9.5 6.5 12 4l2.5 2.5"/>',
  bag: '<path d="M6.5 8.5h11l1.5 12h-14Z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  bank: '<path d="M4 10 12 4l8 6M5.5 10v8M10 10v8M14 10v8M18.5 10v8M4 20h16"/>',
  in: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  bell: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 5 2 6.5 2 6.5h-15s2-1.5 2-6.5Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'ico' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // Static, trusted markup from this file only.
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}

/** Pastel tone per crop, so a crop has the same colour everywhere. */
export const CROP_TONE: Record<string, { tone: string; color: string; icon: IconName }> = {
  grau: { tone: 'butter', color: '--c3', icon: 'sprout' },
  porumb: { tone: 'pink', color: '--c2', icon: 'seed' },
  'floarea-soarelui': { tone: 'mint', color: '--c5', icon: 'sprout' },
};
export const toneOf = (cropId?: string) => CROP_TONE[cropId ?? ''] ?? { tone: 'lilac', color: '--c1', icon: 'bag' as IconName };
