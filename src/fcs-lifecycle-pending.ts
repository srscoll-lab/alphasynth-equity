/** Plain-language reason a three-quarter lifecycle is pending; the current FCS stands on its own. */
export type LifecycleGap = { period_end: string; balance_sheet_end: string; missing_factors: string[] };

const FACTOR_NAMES: Record<string, string> = { earnings: "Earnings", economics: "Economics", execution: "Execution", balance_sheet: "Balance Sheet" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dated = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : iso;

export function lifecyclePendingExplanation(reason: unknown, gaps: unknown): string[] {
  const periods = (Array.isArray(gaps) ? gaps : []).filter((gap: any) => gap?.period_end && Array.isArray(gap?.missing_factors)) as LifecycleGap[];
  const lines: string[] = [];
  if (reason === "balance_sheet_printed_total_debt_not_found") {
    const dates = [...new Set(periods.filter((gap) => gap.missing_factors.includes("balance_sheet")).map((gap) => dated(gap.balance_sheet_end)))];
    lines.push(`Lifecycle pending: no printed "Total Debt" line was found in the company's official filings for the balance sheet as at ${dates.join(" and ") || "an earlier half-year"}.`
      + ` AlphaSynth measures Balance Sheet only from the company's own printed Total Debt (some companies print it only with annual March results), so that quarter cannot complete all four factors.`);
  } else if (reason === "missing_or_noncomparable_quarterly_history") {
    lines.push("Lifecycle pending: the two earlier quarters do not yet have four comparable, verified factors.");
  } else if (reason === "current_score_not_quarterly_comparable") {
    lines.push("Lifecycle pending: the current score does not cover a single comparable quarter.");
  }
  for (const gap of periods) {
    const missing = gap.missing_factors.filter((factor) => FACTOR_NAMES[factor]).map((factor) => FACTOR_NAMES[factor]);
    if (missing.length) lines.push(`Quarter ending ${dated(gap.period_end)}: ${missing.join(", ")} not available from verified official sources.`);
  }
  if (lines.length) lines.push("A three-quarter lifecycle needs all four factors in each quarter. The current FCS above is unaffected.");
  return lines;
}
