// The farm's people (docs/employees-arenda-plan.md §1, migration 026). 'user' for now: the farmer's own taps on
// "Oameni", not assistant tools. Reading them needs no function: they come with the farm (`farm.employees`).
import { AddEmployeeInputSchema, ArchiveEmployeeInputSchema, SetOwnFieldWorkInputSchema, UpdateEmployeeInputSchema } from '../payroll';
import { defineWrite } from './define';

export const addEmployee = defineWrite({
  name: 'add_employee',
  description: 'Adds a person who works on the farm, with what they cost in total each month or each day.',
  input: AddEmployeeInputSchema,
  access: 'user',
  request: (body) => ({ method: 'POST', path: '/api/employees', body }),
});

export const updateEmployee = defineWrite({
  name: 'update_employee',
  description: 'Changes a person on the farm: their cost, their months, their pay day or their dates.',
  input: UpdateEmployeeInputSchema,
  access: 'user',
  request: ({ id, ...body }) => ({ method: 'PUT', path: `/api/employees/${id}`, body }),
});

export const archiveEmployee = defineWrite({
  name: 'archive_employee',
  description: 'Marks that a person left the farm. They stay in the list of past people, with their expenses.',
  input: ArchiveEmployeeInputSchema,
  access: 'user',
  request: ({ id, ...body }) => ({ method: 'POST', path: `/api/employees/${id}/archive`, body }),
});

export const setOwnFieldWork = defineWrite({
  name: 'set_own_field_work',
  description: "Saves whether the farm's own people do the field work, so the plan does not count that work twice.",
  input: SetOwnFieldWorkInputSchema,
  access: 'user',
  request: (body) => ({ method: 'PUT', path: '/api/farm/own-field-work', body }),
});

export const EMPLOYEE_FUNCTIONS = [addEmployee, updateEmployee, archiveEmployee, setOwnFieldWork] as const;
