// The APIA papers on /rapoarte → „Pentru APIA” (docs/rapoarte-apia-plan.md, phase 2). 'user': the farmer's own taps
// on the „Poate ți se aplică” cards. Reading them needs no function: they come with the farm (`farm.apia_facts`).
import { SetApiaFactsInputSchema } from '../reports/apia';
import { SetLivestockInputSchema } from '../reports/livestock';
import { defineWrite } from './define';

export const setApiaFacts = defineWrite({
  name: 'set_apia_facts',
  description: 'Saves whether the farm has animals, uses diesel, has organic land and which crops it declared for coupled support, so the app lists only the APIA papers that apply.',
  input: SetApiaFactsInputSchema,
  access: 'user',
  request: (body) => ({ method: 'PUT', path: '/api/farmers/me/apia-facts', body }),
});

export const setLivestock = defineWrite({
  name: 'set_livestock',
  description: "Saves the farm's animals by APIA category, the ANSVSA exploitation code, the dairy cows and the hay gathered, for the animal declaration, the diesel acord and the hay proof.",
  input: SetLivestockInputSchema,
  access: 'user',
  request: (body) => ({ method: 'PUT', path: '/api/farmers/me/livestock', body }),
});

export const APIA_FUNCTIONS = [setApiaFacts, setLivestock] as const;
