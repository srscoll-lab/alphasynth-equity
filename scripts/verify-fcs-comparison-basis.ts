import assert from "node:assert/strict";
import { normalizeComparisonBasis } from "../src/fcs-comparison-basis.ts";
import { checkpointFromScore } from "../src/fundamental-review-history.ts";

// Balances as at a date become point-in-time; flows and other factors are untouched.
assert.equal(normalizeComparisonBasis("balance_sheet", "total_debt", "annual_prior_year"), "point_in_time_prior_period");
assert.equal(normalizeComparisonBasis("balance_sheet", "net_debt", "annual_prior_year"), "point_in_time_prior_period");
assert.equal(normalizeComparisonBasis("balance_sheet", "debt_to_equity", "sequential_quarter"), "point_in_time_prior_period");
assert.equal(normalizeComparisonBasis("balance_sheet", "net_worth", "same_quarter_prior_year"), "point_in_time_prior_period");
assert.equal(normalizeComparisonBasis("balance_sheet", "net_cash", "point_in_time_prior_period"), "point_in_time_prior_period");
assert.equal(normalizeComparisonBasis("balance_sheet", "free_cash_flow", "annual_prior_year"), "annual_prior_year", "cash flow is a flow");
assert.equal(normalizeComparisonBasis("balance_sheet", "operating_cash_flow", "year_to_date_prior_year"), "year_to_date_prior_year");
assert.equal(normalizeComparisonBasis("earnings", "revenue", "annual_prior_year"), "annual_prior_year");
assert.equal(normalizeComparisonBasis("execution", "order_book", "sequential_quarter"), "point_in_time_prior_period", "an order book is a balance at a date");
assert.equal(normalizeComparisonBasis("execution", "segment_revenue", "same_quarter_prior_year"), "same_quarter_prior_year");
assert.equal(normalizeComparisonBasis("balance_sheet", "total_debt", "other_approved"), "other_approved", "custom rules stay for human approval");

// History gate: issuer quarter spellings accepted; non-quarter labels refused; label normalised.
const impact = (factor: string, metric: string, label: string, end: string, basis = "same_quarter_prior_year") => ({
  metric_id: metric, comparison_basis: basis, consolidation_basis: "consolidated", canonical_unit: "INR crore",
  previous_value: 1, current_value: 2, previous_document_id: "d1", current_document_id: "d2",
  previous_period: { label: "prior", end_date: "2025-06-30" }, current_period: { label, end_date: end }, factor_id: factor });
const score = (executionLabel: string, earningsLabel = "Q1FY27") => ({
  symbol: "SOLARINDS", score_publishable: true, raw_score: 0.98, fcs_score: 74, methodology_id: "m", impact_policy_id: "p",
  factors: [
    { factor_id: "earnings", impacts: [impact("earnings", "revenue", earningsLabel, "2026-06-30")] },
    { factor_id: "economics", impacts: [impact("economics", "ebitda_margin", "Q1 FY27", "2026-06-30")] },
    { factor_id: "execution", impacts: [impact("execution", "segment_revenue", executionLabel, "2026-06-30")] },
    { factor_id: "balance_sheet", impacts: [impact("balance_sheet", "total_debt", "FY26", "2026-03-31", "point_in_time_prior_period")] },
  ] });
const checkpoint = (s: any) => checkpointFromScore({ symbol: "SOLARINDS", score: s, informationCutoff: "2026-10-19",
  calculatedAt: "2026-10-19T00:00:00Z", sourceJobId: "t" });
for (const label of ["Q1FY27", "Q1 FY27", "Q1-FY27", "q1fy27"]) assert.ok(checkpoint(score(label)), `${label} is a quarter label`);
for (const label of ["Q12 FY27", "H1 FY27", "FY27", "Quarter"]) assert.equal(checkpoint(score(label)), null, `${label} is not a quarter label`);
assert.equal(checkpoint(score("Q1FY27"))!.periodLabel, "Q1 FY27", "checkpoint label normalised for publications");
assert.equal(checkpoint(score("Q1 FY27", "Q1-FY27"))!.periodLabel, "Q1 FY27");

console.log("FCS comparison-basis normalisation and quarter-label gate verified.");
