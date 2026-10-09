// Values are transcribed from visually reviewed issuer fact sheets. Each row is
// admitted only when the exact issuer URL, publication date and SHA-256 match.
export const tcsReviewedPeriods: Record<string, any> = {
  "2024-12-31": { sha: "6571f07fdab378406dde65e782404119779c779583158526aff34d844581118b", date: "2025-01-09", file: "https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2024-25/q3/Presentations/Q3%202024-25%20Fact%20Sheet.pdf", values: [123800, 24.5, 10.2, 130320], pages: [4, 3, 15] },
  "2025-03-31": { sha: "403c027306e9bd3c6de24291061b5f5d66b5a26ab3ab48ef2e1056abe5fe9bf2", date: "2025-04-10", file: "https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2024-25/q4/Presentations/Q4%202024-25%20Fact%20Sheet.pdf", values: [122240, 24.2, 12.2, 152940], pages: [5, 4, 19] },
  "2025-06-30": { sha: "4eef574c227799f81034f26a628fcde31e217772029a3c1f1cc7f5d2d853e8b3", date: "2025-07-10", file: "https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2025-26/q1/Presentations/Q1%202025-26%20Fact%20Sheet.pdf", values: [127600, 24.5, 9.4, 128040], pages: [4, 3, 14] },
  "2025-12-31": { sha: "88528fc22d9ea385068ee2dd78b1abf459f4ef154f5863a2c3cc79328fd3c49a", date: "2026-01-12", file: "https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2025-26/q3/Presentations/Q3%202025-26%20Fact%20Sheet.pdf", values: [134380, 25.2, 9.3, 139010], pages: [4, 3, 15] },
  "2026-03-31": { sha: "de73b123f7d859c45c6c516e185d8ae83b4bb7f586df117d5fbdf1e92b797351", date: "2026-04-09", file: "https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2025-26/q4/Presentations/Q4%202025-26%20Fact%20Sheet.pdf", values: [137180, 25.3, 12.0, 146400], pages: [5, 4, 19] },
  "2026-06-30": { sha: "2cb4d08de3aa23cc72a8f8aacceffb9667039c719f5b84278948b72ea1868ca2", date: "2026-07-09", file: "https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2026-27/q1/Presentations/Q1%202026-27%20Fact%20Sheet.pdf", values: [138490, 24.0, 9.5, 124120], pages: [5, 4, 16] },
};

export const TCS_DEFINITIONS = [
  { factor: "earnings", metric: "pat", unit: "INR million", basis: "consolidated_ifrs" },
  { factor: "economics", metric: "operating_margin", unit: "percent", basis: "consolidated_ifrs" },
  { factor: "execution", metric: "deal_tcv", unit: "USD billion", basis: "not_applicable" },
  { factor: "balance_sheet", metric: "operating_cash_flow", unit: "INR million", basis: "consolidated_ifrs" },
] as const;

export function tcsReviewedQuarterRows(end: string, cutoff: string,
  resolveDocument: (url: string, sha: string, date: string) => any, requiredDefinitions: any[] = []) {
  if (!["2025-12-31", "2026-03-31", "2026-06-30"].includes(end)) return [];
  const current = tcsReviewedPeriods[end];
  const previousEnd = `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`;
  const previous = tcsReviewedPeriods[previousEnd];
  if (!current || !previous || current.date > cutoff || previous.date > cutoff) return [];
  if (requiredDefinitions.length && (requiredDefinitions.length !== 4 || !TCS_DEFINITIONS.every(definition =>
    requiredDefinitions.some(required => required.factor === definition.factor && required.metric === definition.metric
      && required.unit === definition.unit && required.consolidation_basis === definition.basis
      && required.comparison_basis === "same_quarter_prior_year")))) return [];
  const currentDocument = resolveDocument(current.file, current.sha, current.date);
  const previousDocument = resolveDocument(previous.file, previous.sha, previous.date);
  if (!currentDocument || !previousDocument) return [];
  const month = end.slice(5, 7);
  const quarter = ({ "12": 3, "03": 4, "06": 1 } as Record<string, number>)[month];
  const fiscalYear = Number(end.slice(0, 4)) + (month === "03" ? 0 : 1);
  const labels = ["Net Income", "Operating Margin", "Order book TCV", "Net Cash from Operations"];
  return TCS_DEFINITIONS.map((definition, index) => ({
    symbol: "TCS", factor: definition.factor, metric_name: definition.metric, unit: definition.unit,
    consolidation_basis: definition.basis, comparison_basis: "same_quarter_prior_year",
    current_period: `Q${quarter} FY${String(fiscalYear).slice(-2)}`, previous_period: `Q${quarter} FY${String(fiscalYear - 1).slice(-2)}`,
    current_period_end_date: end, previous_period_end_date: previousEnd,
    current_value: current.values[index], previous_value: previous.values[index],
    ...currentDocument, previous_document: previousDocument,
    source_page: index === 2 ? current.pages[1] : index === 3 ? current.pages[2] : current.pages[0],
    previous_source_page: index === 2 ? previous.pages[1] : index === 3 ? previous.pages[2] : previous.pages[0],
    quoted_label: labels[index], previous_quoted_label: labels[index], source_type: "company_filing", confidence: 1,
    extraction_method: "visually_reviewed_tcs_fact_sheet", extractor_version: "1.0.0", producer_id: "tcs-reviewed-quarter-ledger",
  }));
}
