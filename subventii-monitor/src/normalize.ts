import { createHash } from 'node:crypto';

// Zero-width characters, word joiner, byte order mark and soft hyphen.
const INVISIBLE = new RegExp(`[${String.fromCharCode(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0xad)}]`, 'g');

const CEDILLA: Record<string, string> = { 'ş': 'ș', 'Ş': 'Ș', 'ţ': 'ț', 'Ţ': 'Ț' };

/**
 * Makes text comparable. Removes differences that aren't real changes: cedilla
 * letters, invisible characters and spacing. Case and line breaks are kept,
 * because a capitalization change is real and diffs need lines.
 */
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[şŞţŢ]/g, (c) => CEDILLA[c] ?? c)
    .replace(INVISIBLE, '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

export function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}
