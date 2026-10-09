// Comparable values are transcribed from each newer issuer factsheet, which
// reports the current quarter and the same quarter one year earlier on one page.
// This preserves the issuer's latest restated comparative basis after disposals
// and acquisitions instead of mixing it with an older, unrecast presentation.
export const coforgeReviewedPeriods: Record<string, any> = {
  "2025-12-31": {
    sha: "ab76e08d67940c6ef889e3907359ef07ef1c1cc345938b813cc12bffe79cab3e",
    date: "2026-01-23",
    file: "https://investors.coforge.com/hubfs/Q3fy26-Investor-Presentation.pdf?hsLang=en",
    page: 16,
    values: [[32581, 41881], [15.5, 17.4], [501, 593], [41.9, 48.7]],
  },
  "2026-03-31": {
    sha: "94238bf4f34f9b93684cffda00f7b70201ae9b7a479eac5594764b301b5f3880",
    date: "2026-05-05",
    file: "https://investors.coforge.com/hubfs/Investor-Presentation-and-Factsheet-Q4FY26.pdf?hsLang=en",
    page: 45,
    values: [[34222, 44504], [17.2, 20.6], [2126, 648], [73.1, 63.1]],
  },
  "2026-06-30": {
    sha: "0128ab93318352dd3bcda36224202827d7e989d1ef145ec8cbfb3c7d3685f079",
    date: "2026-07-28",
    file: "https://investors.coforge.com/hubfs/Investor-Presentation-Q1-FY27.pdf?hsLang=en",
    page: 28,
    values: [[37044, 55277], [17.5, 20.3], [507, 691], [43.8, 57.6]],
  },
};

export const COFORGE_DEFINITIONS = [
  { factor: "earnings", metric: "revenue", unit: "INR million", basis: "consolidated" },
  { factor: "economics", metric: "ebitda_margin", unit: "percent", basis: "consolidated" },
  { factor: "execution", metric: "order_inflow", unit: "USD million", basis: "not_applicable" },
  { factor: "balance_sheet", metric: "operating_cash_flow", unit: "USD million", basis: "consolidated" },
] as const;

export function coforgeReviewedQuarterRows(
  end: string,
  cutoff: string,
  resolveDocument: (url: string, sha: string, date: string) => any,
  requiredDefinitions: any[] = [],
) {
  const period = coforgeReviewedPeriods[end];
  if (!period || period.date > cutoff) return [];
  if (requiredDefinitions.length && (requiredDefinitions.length !== 4 || !COFORGE_DEFINITIONS.every(definition =>
    requiredDefinitions.some(required => required.factor === definition.factor && required.metric === definition.metric
      && required.unit === definition.unit && required.consolidation_basis === definition.basis
      && required.comparison_basis === "same_quarter_prior_year")))) return [];
  const document = resolveDocument(period.file, period.sha, period.date);
  if (!document) return [];
  const previousEnd = `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`;
  const month = end.slice(5, 7);
  const quarter = ({ "12": 3, "03": 4, "06": 1 } as Record<string, number>)[month];
  const fiscalYear = Number(end.slice(0, 4)) + (month === "03" ? 0 : 1);
  const acquisitionContext = end === "2026-06-30" ? "; Q1 FY27 includes two months of Encora contribution" : "";
  const labels = ["Revenue (INR Mn)", "EBITDA Margin", "Fresh Order Intake", "OCF ($ Mn)"];
  return COFORGE_DEFINITIONS.map((definition, index) => ({
    symbol: "COFORGE", factor: definition.factor, metric_name: definition.metric, unit: definition.unit,
    consolidation_basis: definition.basis, comparison_basis: "same_quarter_prior_year",
    current_period: `Q${quarter} FY${String(fiscalYear).slice(-2)}`,
    previous_period: `Q${quarter} FY${String(fiscalYear - 1).slice(-2)}`,
    current_period_end_date: end, previous_period_end_date: previousEnd,
    previous_value: period.values[index][0], current_value: period.values[index][1],
    ...document, previous_document: document,
    source_page: period.page, previous_source_page: period.page,
    quoted_label: labels[index] + acquisitionContext, previous_quoted_label: labels[index] + acquisitionContext,
    source_type: "company_filing", confidence: 1,
    extraction_method: "visually_reviewed_coforge_comparative_factsheet",
    extractor_version: "1.0.0", producer_id: "coforge-reviewed-quarter-ledger",
  }));
}
