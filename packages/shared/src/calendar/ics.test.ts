import { describe, expect, it } from 'vitest';
import { buildIcs } from './ics';

const item = { id: 'apia:cerere', title: 'Depui cererea', date: '2027-05-15' };
const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const field = (ics: string, name: string) => unfold(ics).split('\r\n').find((l) => l.startsWith(name));

describe('buildIcs', () => {
  it('makes an all-day event ending the next day', () => {
    const ics = buildIcs(item, null);
    expect(field(ics, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20270515');
    expect(field(ics, 'DTEND')).toBe('DTEND;VALUE=DATE:20270516');
  });

  it('rolls over the end of a month and a year', () => {
    expect(field(buildIcs({ ...item, date: '2026-12-31' }, null), 'DTEND')).toBe('DTEND;VALUE=DATE:20270101');
    expect(field(buildIcs({ ...item, date: '2028-02-28' }, null), 'DTEND')).toBe('DTEND;VALUE=DATE:20280229');
  });

  it('escapes what the format reserves', () => {
    const ics = buildIcs({ ...item, title: 'A, B; C\\D', description: 'unu\r\ndoi' }, null);
    expect(field(ics, 'SUMMARY')).toBe('SUMMARY:A\\, B\\; C\\\\D');
    expect(field(ics, 'DESCRIPTION')).toBe('DESCRIPTION:unu\\ndoi');
  });

  it('gives the same id and the same file when added twice', () => {
    expect(buildIcs(item, null)).toBe(buildIcs(item, null));
    expect(field(buildIcs(item, null), 'UID')).toBe('UID:apia-cerere-20270515@cropcash');
  });

  it('keeps the same deadline in different years apart', () => {
    expect(field(buildIcs(item, null), 'UID')).not.toBe(field(buildIcs({ ...item, date: '2028-05-15' }, null), 'UID'));
  });

  it('folds long lines at 75 bytes without cutting a letter', () => {
    const title = 'Îngrășăminte de primăvară pe țarină, ș'.repeat(6);
    const ics = buildIcs({ ...item, title }, null);
    /* The text has only one- and two-byte letters. */
    const bytes = (line: string) => [...line].reduce((n, ch) => n + (ch.codePointAt(0)! < 0x80 ? 1 : 2), 0);
    for (const line of ics.split('\r\n')) expect(bytes(line)).toBeLessThanOrEqual(75);
    expect(ics).not.toContain('�');
    expect(field(ics, 'SUMMARY')).toBe(`SUMMARY:${title.replace(/,/g, '\\,')}`);
  });

  it('rings in the morning, the chosen number of days before', () => {
    const ics = buildIcs(item, { daysBefore: 7, hour: 9 });
    expect(ics).toContain('BEGIN:VALARM');
    /* 6 days and 15 hours before midnight of the 15th is 9:00 on the 8th. */
    expect(field(ics, 'TRIGGER')).toBe('TRIGGER:-P6DT15H');
  });

  it('has no alarm when none is asked for', () => {
    expect(buildIcs(item, null)).not.toContain('VALARM');
  });

  it('uses CRLF and ends with one', () => {
    const ics = buildIcs(item, null);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('refuses something that is not a date', () => {
    expect(() => buildIcs({ ...item, date: 'mai' }, null)).toThrow();
  });
});
