/* Writes the app icons in web/public/icons from the logo mark (the sprout on dark, as in the rail).
   Run once after a logo change: node web/scripts/make-icons.mjs. The PNGs are committed. */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

const SPROUT = '<path d="M12 21v-9"/><path d="M12 12C12 8 9 5.5 4.5 5.5 4.5 10 7.5 12 12 12Z"/><path d="M12 14c0-3.5 2.5-6 7.5-6 0 4.5-3 6-7.5 6Z"/>';

/** `inset` is the share of the icon left around the sprout. Maskable icons need a wider safe zone. */
function svg({ rounded, inset }) {
  const size = 24 * (1 + inset * 2);
  const o = 24 * inset;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-o} ${-o} ${size} ${size}">
    <rect x="${-o}" y="${-o}" width="${size}" height="${size}" rx="${rounded ? size * 0.22 : 0}" fill="#1A1A1A"/>
    <g fill="none" stroke="#B4E85C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SPROUT}</g>
  </svg>`;
}

const ICONS = [
  ['icon-192.png', 192, { rounded: true, inset: 0.18 }],
  ['icon-512.png', 512, { rounded: true, inset: 0.18 }],
  ['icon-maskable-512.png', 512, { rounded: false, inset: 0.35 }],
  ['apple-touch-icon.png', 180, { rounded: false, inset: 0.22 }],
];

for (const [name, px, opts] of ICONS) {
  await sharp(Buffer.from(svg(opts))).resize(px, px).png().toFile(join(out, name));
  console.log('wrote', name);
}
