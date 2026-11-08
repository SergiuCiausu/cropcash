/* One deadline as an .ics file, for the phone's own calendar (F-23). Same input, same file, so the
   farmer's calendar can recognise an event added twice. */

export interface IcsItem {
  id: string;
  title: string;
  /** The day it falls on, YYYY-MM-DD. */
  date: string;
  description?: string;
}

export interface IcsReminder {
  daysBefore: number;
  /** Hour of that day, 0–23, on the phone's own clock. */
  hour: number;
}

const escapeText = (s: string) =>
  s
    .replace(/\r\n?/g, '\n')
    .replace(/[\\;,]/g, (c) => `\\${c}`)
    .replace(/\n/g, '\\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '');

const utf8Length = (ch: string) => {
  const cp = ch.codePointAt(0)!;
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
};

/** RFC 5545 caps a line at 75 bytes. Diacritics take two, and a letter is never cut in half. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const n = utf8Length(ch);
    if (bytes + n > 75) {
      parts.push(current);
      current = ' ';
      bytes = 1;
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join('\r\n');
}

function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '');
}

/** An all-day event, with an optional morning alarm some days before. */
export function buildIcs(item: IcsItem, reminder: IcsReminder | null): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) throw new Error(`Not a date: ${item.date}`);
  const day = item.date.replace(/-/g, '');
  /* The date is part of the id because the same deadline comes back every year. */
  const uid = `${item.id.replace(/[^A-Za-z0-9._-]/g, '-')}-${day}@cropcash`;
  const alarm = reminder
    ? [
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(item.title)}`,
        /* An all-day event starts at midnight, so counting back from it lands on the wanted hour. */
        `TRIGGER:-P${reminder.daysBefore - 1}DT${24 - reminder.hour}H`,
        'END:VALARM',
      ]
    : [];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CropCash//RO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${day}T000000Z`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${nextDay(item.date)}`,
    `SUMMARY:${escapeText(item.title)}`,
    ...(item.description ? [`DESCRIPTION:${escapeText(item.description)}`] : []),
    'TRANSP:TRANSPARENT',
    ...alarm,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
