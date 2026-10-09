// Values are transcribed from visually reviewed issuer presentations and are
// admitted only when the exact URL, SHA-256 and publication date all match.
export const persistentReviewedPeriods: Record<string, any> = {
  "2024-12-31": { sha: "a695ba90df1a342afd413e5717977e96a863bfa73c4ee2a0588e015a473d4de1", date: "2025-01-22", file: "https://www.persistent.com/wp-content/uploads/2025/01/analyst-presentation-and-factsheet-q3fy25.pdf", values: [360.2, 14.9, 87.4], pages: [3, 46, 42] },
  "2025-03-31": { sha: "75bc25fdbd31c6442e9db0c9b31c7bd97ba5fd9182b1f1a86a91a73fdf8ae781", date: "2025-04-24", file: "https://www.persistent.com/wp-content/uploads/2025/04/analyst-presentation-and-factsheet-q4fy25.pdf", values: [375.2, 15.6, 88.1], pages: [3, 49, 45] },
  "2025-06-30": { sha: "dc3cfbd879458d9e21e4de740aefe769fa550547820fa6b8054d05205e6a24e6", date: "2025-07-23", file: "https://www.persistent.com/wp-content/uploads/2025/07/analyst-presentation-and-factsheet-q1fy26.pdf", values: [389.7, 15.5, 88.7], pages: [3, 46, 42] },
  "2025-12-31": { sha: "edde142671e4316f6396f42a7204276e3fca22c688c1be70a5bb29444477c458", date: "2026-01-20", file: "https://www.persistent.com/wp-content/uploads/2026/01/analyst-presentation-and-factsheet-q3fy26.pdf", values: [422.5, 14.4, 88.4], cash: [19056.7, 29046.5], pages: [3, 43, 39] },
  "2026-03-31": { sha: "255ffbf8519dd896488435a2c2c7b6b6a296b6381f892718b2267f6d3e5556c9", date: "2026-04-21", file: "https://www.persistent.com/wp-content/uploads/2026/04/analyst-presentation-and-factsheet-q4fy26.pdf", values: [436.0, 16.3, 88.0], cash: [19511.4, 27622.1], pages: [3, 48, 44] },
  "2026-06-30": { sha: "73b5a076f86c3ad7d425e3fc85cae944b6e5fba1de5b5a7f032dd46bf889a00f", date: "2026-08-02", file: "https://www.persistent.com/wp-content/uploads/2026/08/analyst-presentation-and-factsheet-q1fy27.pdf", values: [452.4, 16.0, 86.5], cash: [22751.1, 27044.3], pages: [3, 42, 37] },
};

export const PERSISTENT_DEFINITIONS = [
  { factor: "earnings", metric: "revenue", unit: "USD million", basis: "consolidated" },
  { factor: "economics", metric: "operating_margin", unit: "percent", basis: "consolidated" },
  { factor: "execution", metric: "capacity_utilization", unit: "percent including trainees", basis: "not_applicable" },
  { factor: "balance_sheet", metric: "net_cash", unit: "INR million", basis: "consolidated" },
] as const;

export function persistentReviewedQuarterRows(
  end: string,
  cutoff: string,
  resolveDocument: (url: string, sha: string, date: string) => any,
  requiredDefinitions: any[] = [],
) {
  if (!["2025-12-31", "2026-03-31", "2026-06-30"].includes(end)) return [];
  const current = persistentReviewedPeriods[end];
  const previousEnd = `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`;
  const previous = persistentReviewedPeriods[previousEnd];
  if (!current || !previous || current.date > cutoff || previous.date > cutoff) return [];
  if (requiredDefinitions.length && (requiredDefinitions.length !== 4 || !PERSISTENT_DEFINITIONS.every(definition =>
    requiredDefinitions.some(required => required.factor === definition.factor && required.metric === definition.metric
      && required.unit === definition.unit && required.consolidation_basis === definition.basis
      && required.comparison_basis === (definition.metric === "net_cash" ? "point_in_time_prior_period" : "same_quarter_prior_year"))))) return [];
  const currentDocument = resolveDocument(current.file, current.sha, current.date);
  const previousDocument = resolveDocument(previous.file, previous.sha, previous.date);
  if (!currentDocument || !previousDocument) return [];
  const month = end.slice(5, 7);
  const quarter = ({ "12": 3, "03": 4, "06": 1 } as Record<string, number>)[month];
  const fiscalYear = Number(end.slice(0, 4)) + (month === "03" ? 0 : 1);
  const labels = ["Revenue", "EBIT Margin", "Utilization including trainees"];
  const rows = PERSISTENT_DEFINITIONS.slice(0, 3).map((definition, index) => ({
    symbol: "PERSISTENT", factor: definition.factor, metric_name: definition.metric, unit: definition.unit,
    consolidation_basis: definition.basis, comparison_basis: "same_quarter_prior_year",
    current_period: `Q${quarter} FY${String(fiscalYear).slice(-2)}`,
    previous_period: `Q${quarter} FY${String(fiscalYear - 1).slice(-2)}`,
    current_period_end_date: end, previous_period_end_date: previousEnd,
    current_value: current.values[index], previous_value: previous.values[index],
    ...currentDocument, previous_document: previousDocument,
    source_page: index < 2 ? current.pages[0] : current.pages[1],
    previous_source_page: index < 2 ? previous.pages[0] : previous.pages[1],
    quoted_label: labels[index], previous_quoted_label: labels[index],
    source_type: "company_filing", confidence: 1,
    extraction_method: "visually_reviewed_persistent_quarter_presentation",
    extractor_version: "1.0.0", producer_id: "persistent-reviewed-quarter-ledger",
  }));
  rows.push({
    symbol: "PERSISTENT", factor: "balance_sheet", metric_name: "net_cash", unit: "INR million",
    consolidation_basis: "consolidated", comparison_basis: "point_in_time_prior_period",
    current_period: `Q${quarter} FY${String(fiscalYear).slice(-2)}`,
    previous_period: `Q${quarter} FY${String(fiscalYear - 1).slice(-2)}`,
    current_period_end_date: end, previous_period_end_date: previousEnd,
    current_value: current.cash[1], previous_value: current.cash[0],
    ...currentDocument, previous_document: currentDocument,
    source_page: current.pages[2], previous_source_page: current.pages[2],
    quoted_label: "Cash and Investments", previous_quoted_label: "Cash and Investments",
    source_type: "company_filing", confidence: 1,
    extraction_method: "visually_reviewed_persistent_comparative_balance_sheet",
    extractor_version: "1.0.0", producer_id: "persistent-reviewed-quarter-ledger",
  } as any);
  return rows;
}
