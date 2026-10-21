/**
 * Balance-sheet balances and ratios are measured AT a date (e.g. total debt as
 * at 31 Mar 2026), not over a period. Extractors sometimes label a year-end
 * balance comparison "annual_prior_year", which the scorer reads as a 12-month
 * flow and rejects for having no period length. For these metrics the only
 * correct basis is point_in_time_prior_period. Cash flows remain flows.
 */
export const BALANCE_SHEET_STOCK_METRICS = new Set([
  "total_debt", "net_debt", "net_cash", "net_worth", "net_assets", "total_equity",
  "debt_to_equity", "current_ratio", "net_debt_to_ebitda_ratio", "gnpa", "nnpa", "capital_adequacy",
]);

/** Execution balances as at a date (an order book is a backlog, not a flow). */
export const EXECUTION_STOCK_METRICS = new Set(["order_book"]);

const PERIOD_BASES = new Set(["annual_prior_year", "year_to_date_prior_year", "same_quarter_prior_year", "sequential_quarter"]);

export function normalizeComparisonBasis(factor: string | undefined, metric: string | undefined, basis: string): string {
  const stock = metric && ((factor === "balance_sheet" && BALANCE_SHEET_STOCK_METRICS.has(metric))
    || (factor === "execution" && EXECUTION_STOCK_METRICS.has(metric)));
  return stock && PERIOD_BASES.has(basis) ? "point_in_time_prior_period" : basis;
}
