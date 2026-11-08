/* The app icons in mobile/assets, from the same sprout mark as the web app (web/scripts/make-icons.mjs).
   Run after a logo change: node mobile/scripts/make-icons.mjs. sharp comes from the repo root. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const SPROUT = '<path d="M12 21v-9"/><path d="M12 12C12 8 9 5.5 4.5 5.5 4.5 10 7.5 12 12 12Z"/><path d="M12 14c0-3.5 2.5-6 7.5-6 0 4.5-3 6-7.5 6Z"/>';

/** `bg` null leaves it transparent (Android draws its own background). `inset` is the margin around the sprout. */
function svg({ bg, stroke, inset }) {
  const size = 24 * (1 + inset * 2);
  const o = 24 * inset;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-o} ${-o} ${size} ${size}">
    ${bg ? `<rect x="${-o}" y="${-o}" width="${size}" height="${size}" fill="${bg}"/>` : ''}
    <g fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SPROUT}</g>
  </svg>`;
}

const ICONS = [
  // iOS and the store: square, no transparency, iOS rounds the corners itself.
  ['icon.png', 1024, { bg: '#1A1A1A', stroke: '#B4E85C', inset: 0.22 }],
  // Android adaptive icon: only the middle ~66% is always visible.
  ['android-icon-foreground.png', 1024, { bg: null, stroke: '#B4E85C', inset: 0.6 }],
  ['android-icon-monochrome.png', 1024, { bg: null, stroke: '#FFFFFF', inset: 0.6 }],
];

for (const [name, px, opts] of ICONS) {
  await sharp(Buffer.from(svg(opts))).resize(px, px).png().toFile(join(out, name));
  console.log('wrote', name);
}
