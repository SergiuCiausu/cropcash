// The farmer's own calendar events (docs/calendar-events-plan.md). add_event is 'confirm': the assistant
// may propose it as a card. The others stay 'user': the farmer's own taps in the calendar. They only note plans and what happened, so the phone
// may queue them offline. Parcel work goes through add_operation (functions/plots.ts).
import { z } from 'zod';
import { ConfirmOccurrenceSchema, EventInputSchema, EventPatchSchema, OccurrenceInputSchema } from '../calendar/events';
import { defineWrite } from './define';

const Id = z.uuid();
const Day = z.iso.date();

export const UpdateEventInputSchema = z.strictObject({ id: Id, patch: EventPatchSchema });
export const EventIdInputSchema = z.strictObject({ id: Id });
export const SetOccurrenceInputSchema = z.strictObject({ eventId: Id, date: Day, change: OccurrenceInputSchema });
export const ConfirmOccurrenceInputSchema = ConfirmOccurrenceSchema.extend({ eventId: Id, originalDate: Day });

const occurrencePath = (id: string, date: string) => `/api/events/${encodeURIComponent(id)}/occurrences/${date}`;

export const addEvent = defineWrite({
  name: 'add_event',
  description:
    'Adds something to the farmer’s calendar: a reminder, a visit, a payment to make or money to receive, once or repeating. A sum (amountLei, whole lei) goes into the plan and lowers or raises the salary. Only when the farmer asks to put it in the calendar.',
  input: EventInputSchema,
  request: (body) => ({ method: 'POST', path: '/api/events', body }),
});

export const updateEvent = defineWrite({
  name: 'update_event',
  description: 'Changes an event in the farmer’s calendar: the whole series, or this date and the ones after it.',
  input: UpdateEventInputSchema,
  access: 'user',
  request: ({ id, patch }) => ({ method: 'PUT', path: `/api/events/${encodeURIComponent(id)}`, body: patch }),
});

export const deleteEvent = defineWrite({
  name: 'delete_event',
  description: 'Removes an event from the farmer’s calendar, with all its dates.',
  input: EventIdInputSchema,
  access: 'user',
  request: ({ id }) => ({ method: 'DELETE', path: `/api/events/${encodeURIComponent(id)}` }),
  repeatSafe: 'gone',
});

export const setOccurrence = defineWrite({
  name: 'set_occurrence',
  description: 'Changes one date of a calendar event only: moves it, renames it, changes the sum, cancels it, or marks it done.',
  input: SetOccurrenceInputSchema,
  access: 'user',
  request: ({ eventId, date, change }) => ({ method: 'PUT', path: occurrencePath(eventId, date), body: change }),
});

export const confirmOccurrence = defineWrite({
  name: 'confirm_occurrence',
  description: 'Says that a planned payment or income really happened, and records it as an expense or a sale.',
  input: ConfirmOccurrenceInputSchema,
  access: 'user',
  request: ({ eventId, originalDate, ...body }) => ({ method: 'POST', path: `${occurrencePath(eventId, originalDate)}/confirm`, body }),
});

export const EVENT_FUNCTIONS = [addEvent, updateEvent, deleteEvent, setOccurrence, confirmOccurrence] as const;
