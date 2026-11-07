// Decides whether a call is something a farmer can actually use. A keyword match
// isn't enough: a call that mentions farmers may be open only to research groups
// or town halls. Labels are a first filter, not a legal eligibility decision.
import type { Draft, Relevance } from './types.ts';

function plain(text: string | null): string {
  return (text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// "rural" isn't here: rural town halls are the usual applicants it finds.
const FARMING = /\b(fermier|exploatati\w* agricol|agricultor|zootehni|legumicol|pomicol|viticol|apicol|acvacultur|pescuit|piscicol)/;
const FARMING_TOPIC = /\b(fermier|agricol|agricultur|zootehni|legumicol|pomicol|viticol|apicol|acvacultur|pescuit|piscicol|farmer|farming|agricultur|livestock|crop|rural)/;
const BUSINESS = /\b(microintreprinder|intreprinder|imm\b|pfa\b|societat|firma|operator economic)/;

export function classify(draft: Draft): { relevance: Relevance; note: string | null } {
  if (draft.kind === 'afir') {
    return { relevance: 'direct', note: 'Depunere directă; condițiile sunt în ghidul solicitantului.' };
  }
  if (draft.kind === 'ec') {
    return FARMING_TOPIC.test(plain(draft.title))
      ? { relevance: 'partnership', note: 'De obicei necesită un consorțiu cu parteneri din mai multe țări.' }
      : { relevance: 'not_relevant', note: null };
  }

  const applicants = plain(draft.applicants);
  if (FARMING.test(applicants)) {
    return { relevance: 'direct', note: 'Fermierii sunt menționați printre beneficiari.' };
  }
  if (BUSINESS.test(applicants)) {
    return { relevance: 'conditional', note: 'Pentru firme; depinde de forma juridică și de activitate.' };
  }
  if (FARMING_TOPIC.test(plain(draft.title))) {
    return { relevance: 'conditional', note: 'Tema este agricolă; verifică cine poate depune.' };
  }
  return { relevance: 'not_relevant', note: null };
}
