/* Words the assistant cards share. Figures never come from here: only names for months and years. */
const MONTHS_LONG = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const MONTHS_SHORT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];

/** "2027-06" → "iunie 2027". */
export const monthName = (key: string) => `${MONTHS_LONG[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

/** "2027-06" → "iun", for chart labels. */
export const monthShort = (key: string) => MONTHS_SHORT[Number(key.slice(5, 7)) - 1];

export const SCENARIO = { bad: 'an slab', medium: 'an normal', good: 'an bun' } as const;
