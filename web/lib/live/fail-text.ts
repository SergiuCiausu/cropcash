/* What the farmer reads when something didn't work (docs/failure-handling-plan.md, FAIL-03 and FAIL-13).
   One place, so every page says the same thing for the same problem. Plain words: what happened,
   whether what they typed is still there, what to do. Checked by language.test.ts. */

/** What the farmer was doing. Money is said differently: there, "try again" can be the wrong advice. */
export type FailKind = 'record' | 'plan' | 'money' | 'read' | 'ai' | 'paper';

export const FAIL_TEXT = {
  offline: {
    record: 'Nu am putut salva, pentru că nu ai internet. Încearcă din nou când îl ai.',
    plan: 'Nu am putut salva, pentru că nu ai internet. Încearcă din nou când îl ai.',
    money: 'Pornește internetul ca să muți banii.',
    read: 'Pornește internetul ca să vezi ce e nou.',
    ai: 'Pornește internetul ca să întrebi.',
    paper: 'Pornește internetul ca să citim hârtia.',
  },
  /* Sent, but no answer: the server may have done it. */
  timeout: {
    record: 'Serverul n-a răspuns la timp. Ce ai scris rămâne aici. Încearcă din nou.',
    plan: 'Serverul n-a răspuns la timp. Ce ai scris rămâne aici. Încearcă din nou.',
    read: 'Nu am putut aduce datele acum. Încearcă din nou.',
    ai: 'Răspunsul durează prea mult. Încearcă din nou sau întreabă mai scurt.',
    paper: 'Hârtia nu s-a citit la timp. Încearcă din nou sau scrie de mână.',
  },
  network: 'Legătura s-a întrerupt. Ce ai scris rămâne aici. Încearcă din nou.',
  /* A money move whose answer was lost, until /api/me says whether it happened. */
  moneyUnknown: 'Nu știm încă dacă s-a făcut. Nu apăsa din nou. Verificăm când ai internet.',
  /* After /api/me showed it didn't happen. */
  moneyNotDone: 'N-a mers. Nu s-au mutat bani. Încearcă din nou.',
  signIn: 'Trebuie să intri din nou în cont. Ce ai scris rămâne aici.',
  tooMany: 'Prea multe încercări. Mai încearcă peste un minut.',
  server: 'Serverul are o problemă. Ce ai scris rămâne aici. Încearcă din nou peste puțin.',
  codes: {
    busy: 'Se lucrează deja la asta. Încearcă din nou peste un minut.',
    pension_exists: 'Pensia e deja pornită. Am adus cifrele noi.',
    no_pension: 'Nu ai o pensie pornită.',
    stale_clock: 'Data din demo s-a schimbat între timp. Am adus data nouă.',
    changed_elsewhere: 'Ferma s-a schimbat pe alt telefon. Am adus cifrele noi.',
    no_farm: 'Fă-ți întâi ferma.',
    stripe_not_set_up: 'Deschide întâi contul CropCash din pagina Bani.',
    credit_received: 'Creditul a intrat deja, nu se mai poate scoate.',
    too_much: 'Suma din plicuri e mai mare decât banii pe care îi ai.',
    daily_limit: 'Ai pus multe întrebări azi. Mai încearcă mâine.',
    assistant_unavailable: 'Asistentul nu merge acum. Încearcă mai târziu.',
  },
  generic: {
    record: 'Nu am putut salva. Încearcă din nou.',
    plan: 'Nu am putut salva. Încearcă din nou.',
    money: 'Nu a mers. Încearcă din nou.',
    read: 'Nu am putut aduce datele acum. Încearcă din nou.',
    ai: 'Nu am putut răspunde acum. Încearcă din nou.',
    paper: 'Acum nu putem citi hârtii. Încearcă mai târziu sau scrie de mână.',
  },
} as const;

type Failure = { status?: unknown; code?: unknown } | null | undefined;

/**
 * The sentence for a failed call. `online` is the page's own idea of the net (navigator.onLine and
 * the ping), so a dropped connection on a phone that is offline reads as "no internet".
 */
export function failText(error: unknown, kind: FailKind = 'record', online = true): string {
  const e = error as Failure;
  const status = typeof e?.status === 'number' ? e.status : 0;
  const code = typeof e?.code === 'string' ? e.code : '';

  if (code === 'offline' || (status === 0 && code === 'network' && !online)) return FAIL_TEXT.offline[kind];
  if (code === 'money_not_done') return FAIL_TEXT.moneyNotDone;
  if (code in FAIL_TEXT.codes) return FAIL_TEXT.codes[code as keyof typeof FAIL_TEXT.codes];
  if (status === 401) return FAIL_TEXT.signIn;
  if (status === 429) return FAIL_TEXT.tooMany;
  /* For money, a lost answer or a server error doesn't say whether it happened. The page checks
     /api/me and then says moneyNotDone, or reloads into the new state. */
  if (kind === 'money' && (code === 'timeout' || code === 'network' || status >= 500)) return FAIL_TEXT.moneyUnknown;
  if (code === 'timeout') return FAIL_TEXT.timeout[kind as Exclude<FailKind, 'money'>];
  if (code === 'network') return FAIL_TEXT.network;
  if (status >= 500) return FAIL_TEXT.server;
  return FAIL_TEXT.generic[kind];
}
