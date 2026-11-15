/* The images the farm map paints parcels and icons with (docs/harta-plan.md, step 7): a crop's colour with
   its marks (wheat stripes, maize dots, sunflower rings), and the crop icons as pictures for when there are
   too many parcels for one marker each. Drawn at twice the size for sharp screens. Null where there is no
   canvas, and the map then uses plain colours. */
import { INK, type Pattern } from './palette';

export const PIXEL_RATIO = 2;
const TILE = 16 * PIXEL_RATIO;
const ICON = 40 * PIXEL_RATIO;

function canvas(size: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  try {
    return c.getContext('2d');
  } catch {
    return null;
  }
}

/** A seamless tile: the colour, and the crop's marks in the outline ink, faint. */
export function patternImage(pattern: Pattern, color: string): ImageData | null {
  const g = canvas(TILE);
  if (!g) return null;
  g.fillStyle = color;
  g.fillRect(0, 0, TILE, TILE);
  g.fillStyle = g.strokeStyle = INK.outline;
  g.globalAlpha = 0.16;
  const s = TILE;
  if (pattern === 'stripes') {
    g.lineWidth = 2 * PIXEL_RATIO;
    // Two diagonals offset by a tile so the stripes run on across tiles.
    for (const o of [-s, 0, s]) {
      g.beginPath();
      g.moveTo(o, s);
      g.lineTo(o + s, 0);
      g.stroke();
    }
  } else if (pattern === 'dots') {
    for (const [x, y] of [
      [s / 4, s / 4],
      [(3 * s) / 4, (3 * s) / 4],
    ]) {
      g.beginPath();
      g.arc(x!, y!, 2 * PIXEL_RATIO, 0, Math.PI * 2);
      g.fill();
    }
  } else if (pattern === 'ring') {
    g.lineWidth = 1.5 * PIXEL_RATIO;
    g.beginPath();
    g.arc(s / 2, s / 2, s / 4, 0, Math.PI * 2);
    g.stroke();
  }
  return g.getImageData(0, 0, TILE, TILE);
}

/** A crop icon on a soft white disc, for the symbol layer. */
export function iconImage(emoji: string): ImageData | null {
  const g = canvas(ICON);
  if (!g) return null;
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.shadowColor = 'rgba(43,53,80,0.25)';
  g.shadowBlur = 4 * PIXEL_RATIO;
  g.shadowOffsetY = 1 * PIXEL_RATIO;
  g.beginPath();
  g.arc(ICON / 2, ICON / 2, ICON / 2 - 5 * PIXEL_RATIO, 0, Math.PI * 2);
  g.fill();
  g.shadowColor = 'transparent';
  g.font = `${20 * PIXEL_RATIO}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, ICON / 2, ICON / 2 + PIXEL_RATIO);
  return g.getImageData(0, 0, ICON, ICON);
}

export const iconId = (emoji: string) => `cc-icon-${[...emoji].map((c) => c.codePointAt(0)!.toString(16)).join('-')}`;
