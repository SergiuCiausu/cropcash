import type { z } from 'zod';
import type { IsoDate } from '../cashflow';
import type { ExchangeRates } from '../currency';
import type { AppData } from '../data';
import type { StoredFarm } from '../farm';
import type { MonitorData, MonitorNeed } from '../opportunities';
import { planUnverified, type FarmPlan } from './plan';

/**
 * What the AI may do with a function (docs/functions.md):
 * read = runs it directly; confirm = proposes it, the farmer taps to approve;
 * user = not a tool, the AI never sees it.
 */
export type FunctionAccess = 'read' | 'confirm' | 'user';

/** Where it executes, which decides the offline behaviour. */
export type FunctionRuns = 'phone' | 'outbox' | 'api';

export interface FunctionDef<Input extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: Input;
  access: FunctionAccess;
  runs: FunctionRuns;
}

export interface FunctionSource {
  title: string;
  url: string;
}

/** What a read function returns to a button or to the AI. */
export interface FunctionResult<T> {
  data: T | null;
  /** ISO date the result was computed for. */
  asOf: string;
  /** DE-VERIFICAT items the result relies on. */
  unverified: string[];
  sources: FunctionSource[];
}

/** What a read function works from. The phone and the API build the same one. */
export interface ReadContext {
  farm: StoredFarm;
  plan: FarmPlan;
  data: AppData;
  today: IsoDate;
  /** Only for functions with `usesRates`. */
  rates?: ExchangeRates | null;
  /** Only for functions with `needs`. Loaded by the API, because it lives in the database. */
  monitor?: MonitorData;
}

export interface ReadFunction<Input extends z.ZodType = z.ZodType, Output = unknown> extends FunctionDef<Input> {
  access: 'read';
  runs: 'phone' | 'api';
  usesRates: boolean;
  needs: MonitorNeed[];
  /** Validates the input, so a bad call throws instead of returning a wrong figure. */
  execute(rawInput: unknown, ctx: ReadContext): FunctionResult<Output>;
}

/** A pure calculation over the plan: runs on the phone, and on the API for the AI. */
export function defineRead<Input extends z.ZodType, Output>(def: {
  name: string;
  description: string;
  input: Input;
  run(input: z.output<Input>, ctx: ReadContext): Output;
  sources?(output: Output, ctx: ReadContext): FunctionSource[];
  /** Unconfirmed items beyond the ones every plan carries. */
  unverified?(output: Output, ctx: ReadContext): string[];
  /** Defaults to 'phone'. */
  runs?: 'phone' | 'api';
  usesRates?: boolean;
  /** Monitor data to load before it runs. */
  needs?: MonitorNeed[];
}): ReadFunction<Input, Output> {
  const { name, description, input, run, sources, unverified, runs = 'phone', usesRates = false, needs = [] } = def;
  return {
    name,
    description,
    input,
    access: 'read',
    runs,
    usesRates,
    needs,
    execute(rawInput, ctx) {
      const output = run(input.parse(rawInput) as z.output<Input>, ctx);
      return {
        data: output,
        asOf: ctx.today,
        unverified: [...planUnverified(ctx.plan.subsidies), ...(unverified?.(output, ctx) ?? [])],
        sources: sources?.(output, ctx) ?? [],
      };
    },
  };
}

export interface ApiRequest {
  method: 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
}

export interface WriteFunction<Input extends z.ZodType = z.ZodType> extends FunctionDef<Input> {
  access: 'confirm' | 'user';
  runs: 'api';
  /** The API call that performs it. Moves or saves money data, so it never joins the outbox. */
  request(input: z.input<Input>): ApiRequest;
}

/** Needs the database. The AI can only propose it; the farmer's tap sends the request. */
export function defineWrite<Input extends z.ZodType>(def: {
  name: string;
  description: string;
  input: Input;
  request(input: z.output<Input>): ApiRequest;
  /** 'user' hides it from the AI completely. Defaults to 'confirm'. */
  access?: 'confirm' | 'user';
}): WriteFunction<Input> {
  const { name, description, input, request, access = 'confirm' } = def;
  return {
    name,
    description,
    input,
    access,
    runs: 'api',
    request: (raw) => request(input.parse(raw) as z.output<Input>),
  };
}
