import { z } from 'zod';
import type { Bani } from '../money';
import type { SubsidyResult } from './index';

const MAX_DECISION_BANI = 1_000_000_000;

/** The total on the farmer's APIA payment decision, confirmed by a tap. Money expected, not received. */
export const ApiaDecisionSchema = z.strictObject({
  campaignYear: z.number().int().min(2000).max(2100),
  totalBani: z.number().int().positive().max(MAX_DECISION_BANI),
});
export type ApiaDecision = z.infer<typeof ApiaDecisionSchema>;

/**
 * The real total replaces the estimated range. The schemes stay as estimated, because the farmer
 * confirms one total. An advance that already arrived is a fact, so the balance is what's left of
 * the total. Before it arrives, the advance keeps the estimate's share of the total.
 */
export function withApiaDecision(
  estimate: SubsidyResult,
  decision: ApiaDecision | null | undefined,
  campaignYear: number,
  advanceReceived: Bani = 0,
): SubsidyResult {
  if (!decision || decision.campaignYear !== campaignYear) return estimate;
  const { totalBani } = decision;
  const { lei, advanceLei } = estimate.totals;
  const advanceShare = lei.probable > 0 ? Math.round((totalBani * advanceLei) / lei.probable) : 0;
  const advance = Math.min(totalBani, advanceReceived > 0 ? advanceReceived : advanceShare);
  const balance = totalBani - advance;
  const rate = estimate.rates.FEGA.value;
  const eur = (bani: Bani) => Math.round(bani / rate);
  const fixed = (value: number) => ({ min: value, probable: value, max: value });
  return {
    ...estimate,
    decision,
    totals: {
      lei: fixed(totalBani),
      eur: fixed(eur(totalBani)),
      advanceLei: advance,
      advanceEur: eur(advance),
      balanceLei: fixed(balance),
      balanceEur: fixed(eur(balance)),
    },
  };
}
