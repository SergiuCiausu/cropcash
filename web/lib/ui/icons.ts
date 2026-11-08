/* The app's line icons (24×24, stroked). Moved out of web/legacy/shared.js so the legacy pages and
   the React frame draw the same ones. */

export const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6Z"/><path d="m9 12 2.2 2.2L15.2 10"/>',
  cal: '<rect x="4" y="5.5" width="16" height="15" rx="3"/><path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z"/><path d="M9.5 20.5V14h5v6.5"/>',
  chart: '<path d="M5 20v-7M12 20V5M19 20v-10"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 5.5 4.5 5.5 4.5 10 7.5 12 12 12Z"/><path d="M12 14c0-3.5 2.5-6 7.5-6 0 4.5-3 6-7.5 6Z"/>',
  bank: '<path d="M3 21h18M5 21V10M19 21V10M9.5 21V10M14.5 21V10M3 10l9-6 9 6Z"/>',
  sack: '<path d="M6.5 8.5h11l1.5 12H5Z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  down: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  up: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  map: '<path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7Z"/><path d="M9 4v13M15 7v13"/>',
  tool: '<path d="M20 7.5a5 5 0 0 1-6.7 4.7l-6.8 6.8a2 2 0 0 1-2.8-2.8l6.8-6.8A5 5 0 0 1 17 4l-3 3 3 3Z"/>',
  drop: '<path d="M12 3.5c3.5 4.5 6 7.5 6 10.5a6 6 0 0 1-12 0c0-3 2.5-6 6-10.5Z"/>',
  spray: '<path d="M9 9h6v11.5H9ZM10.5 9V5.5h3V9M16.5 4h.01M19.5 4h.01M18 6.5h.01M19.5 9h.01"/>',
  seed: '<path d="M12 21c-4.5-2-6-6-6-9.5C6 7.5 9 4 12 3c3 1 6 4.5 6 8.5 0 3.5-1.5 7.5-6 9.5Z"/><path d="M12 8v8"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  hourglass: '<path d="M7 3.5h10M7 20.5h10"/><path d="M8 3.5c0 4.5 8 4.5 8 8.5s-8 4-8 8.5"/><path d="M16 3.5c0 4.5-8 4.5-8 8.5s8 4 8 8.5"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  more: '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
} as const;

export type IconName = keyof typeof ICONS;

/** The icon as an SVG string, for the legacy pages' innerHTML. */
export const iconSvg = (name: IconName) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
