// The excise schemes the farm joined (docs/accize-plan.md §2.2): „Mă interesează”, „Am depus acordul”, „Am primit
// acordul” on /subventii → „Accize”. 'user': the farmer's own taps. Reading them needs no function: they come with
// the farm (`farm.farm_excise_schemes`). It notes a choice, no money moves, so it may wait in the queue offline.
import { SetExciseEnrollmentInputSchema } from '../data/excise';
import { defineWrite } from './define';

export const setExciseEnrollment = defineWrite({
  name: 'set_excise_enrollment',
  description: 'Saves whether the farm follows, filed the acord for, or was approved for an excise scheme in a year, so an approved diesel acord puts the refund in the plan.',
  input: SetExciseEnrollmentInputSchema,
  access: 'user',
  request: ({ schemeId, year, status, acordOn }) => ({
    method: 'PUT',
    path: `/api/excise/${encodeURIComponent(schemeId)}/${year}`,
    body: { status, acordOn },
  }),
});

export const EXCISE_FUNCTIONS = [setExciseEnrollment] as const;
