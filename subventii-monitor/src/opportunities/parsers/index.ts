import type { Parser } from '../types.ts';
import { parseAfirSessions } from './afir.ts';
import { parseMipeCalendar } from './mipe.ts';

const PARSERS: Record<string, Parser> = {
  'https://depunerepspac.afir.ro/Sesiune/Lista': parseAfirSessions,
  'https://mfe.gov.ro/calendar-apeluri-de-finantare/': parseMipeCalendar,
};

export function parserFor(url: string): Parser | undefined {
  return PARSERS[url];
}
