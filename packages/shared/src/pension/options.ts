import type { AppData } from '../data';
import { leiToBani, type Bani } from '../money';

/**
 * The other ways to save for old age, beside the one the app simulates (docs/05 §2 and §3), so the
 * pension page can say why it uses Pilonul III. Figures come from pension-options.json and
 * pension-funds.json only. A figure that isn't confirmed is flagged, and a missing one stays null.
 */
export interface PensionOptions {
  state: {
    /** Least a month on an optional contract with the Casa de Pensii. */
    contractMonthly: Bani;
    contractFrom: string;
    /** The same through the Declarația Unică, a year at a time. */
    declarationYearly: Bani;
    declarationVerified: boolean;
    minimumPension: Bani;
    minimumYears: number;
  };
  pilon3: {
    /** Every fund, A to Z. No order by size or growth: the app doesn't pick a fund (docs/05 §3). */
    funds: PensionOptionFund[];
    /** The lowest monthly minimum among the funds, counting only confirmed figures. */
    lowestMonthly: Bani | null;
    lowestFund: string | null;
  };
  cei: {
    availableFrom: string;
    /** Null until a source gives the yearly ceiling. */
    ceilingYearly: Bani | null;
  };
  /** Years of payments left before the target age, for someone who starts now. */
  yearsLeft: number;
  /** False when starting now can't reach the years the minimum state pension asks for. */
  enoughYearsForMinimum: boolean;
}

export interface PensionOptionFund {
  id: string;
  name: string;
  administrator: string | null;
  /** Least a month; null when no source gives it. */
  minMonthly: Bani | null;
  verified: boolean;
}

export function pensionOptions(data: AppData, age: number): PensionOptions {
  const o = data.pensionOptions;
  const confirmed = data.pensionFunds.funds
    .filter((f) => f.status !== 'DE-VERIFICAT' && f.min_monthly_lei !== null)
    .sort((a, b) => a.min_monthly_lei! - b.min_monthly_lei! || a.name.localeCompare(b.name, 'ro'));
  const lowest = confirmed[0] ?? null;
  const yearsLeft = Math.max(0, data.params.pension.target_age.value - age);
  const minimumYears = o.state.minimum_pension_years.value;
  return {
    state: {
      contractMonthly: leiToBani(o.state.optional_contract_monthly_lei.value),
      contractFrom: o.state.optional_contract_monthly_lei.from,
      declarationYearly: leiToBani(o.state.optional_declaration_yearly_lei.value),
      declarationVerified: o.state.optional_declaration_yearly_lei.status !== 'DE-VERIFICAT',
      minimumPension: leiToBani(o.state.minimum_pension_monthly_lei.value),
      minimumYears,
    },
    pilon3: {
      funds: [...data.pensionFunds.funds]
        .sort((a, b) => a.name.localeCompare(b.name, 'ro'))
        .map((f) => ({
          id: f.id,
          name: f.name,
          administrator: f.administrator,
          minMonthly: f.min_monthly_lei === null ? null : leiToBani(f.min_monthly_lei),
          verified: f.status !== 'DE-VERIFICAT' && f.min_monthly_lei !== null,
        })),
      lowestMonthly: lowest ? leiToBani(lowest.min_monthly_lei!) : null, lowestFund: lowest?.name ?? null },
    cei: {
      availableFrom: o.cei.available_from,
      ceilingYearly: o.cei.ceiling_yearly_lei === null ? null : leiToBani(o.cei.ceiling_yearly_lei),
    },
    yearsLeft,
    enoughYearsForMinimum: yearsLeft >= minimumYears,
  };
}
