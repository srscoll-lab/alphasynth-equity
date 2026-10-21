/**
 * Owner decisions (21 Oct 2026): each factor uses one standard measure when the
 * issuer reports it, so every quarter of a series compares the same thing.
 *   Execution:     order_book (balance as at the period end); otherwise named segments.
 *   Balance Sheet: total_debt (the issuer's printed "Total Debt" line).
 * When a verified row of the standard metric exists, other rows of that factor
 * are set aside for that quarter (recorded in diagnostics, never silently).
 */
export const STANDARD_METRICS: ReadonlyArray<{ factor: string; metric: string }> = [
  { factor: "execution", metric: "order_book" },
  { factor: "balance_sheet", metric: "total_debt" },
];

/** total_debt is admitted only from the issuer's own printed "Total Debt" line. */
export function isPrintedTotalDebtLabel(quotedLabel: string): boolean {
  return /\btotal\s+debts?\b/i.test(quotedLabel);
}

export function preferStandardMetrics<T extends { candidates: any[]; validations: any[]; diagnostics: any[] }>(evidence: T): T {
  let result = evidence;
  for (const { factor, metric } of STANDARD_METRICS) {
    const rows = result.candidates.filter((candidate) => candidate.factor_id === factor);
    if (!rows.some((candidate) => candidate.canonical_metric_id === metric)) continue;
    const setAside = rows.filter((candidate) => candidate.canonical_metric_id !== metric);
    if (!setAside.length) continue;
    const ids = new Set(setAside.map((candidate) => candidate.candidate_id));
    result = { ...result,
      candidates: result.candidates.filter((candidate) => !ids.has(candidate.candidate_id)),
      validations: result.validations.filter((validation) => !ids.has(validation.candidate_id)),
      diagnostics: [...result.diagnostics, { outcome: "factor_standardised_on_metric", factor, metric,
        set_aside: setAside.map((candidate) => candidate.canonical_metric_id) }] };
  }
  return result;
}
