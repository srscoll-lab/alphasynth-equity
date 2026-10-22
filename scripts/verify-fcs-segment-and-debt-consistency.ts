import assert from "node:assert/strict";
import { isPrintedTotalDebtLabel, preferStandardMetrics } from "../src/fcs-standard-metrics.ts";
import { alignExecutionAcrossQuarters, type QuarterEvidence } from "../src/fcs-segment-alignment.ts";
import { normalizeComparisonBasis } from "../src/fcs-comparison-basis.ts";
import { checkpointFromScore, historyMetricDefinitions, lockedSourceLabel } from "../src/fundamental-review-history.ts";

// 1. Balance Sheet: only the issuer's printed "Total Debt" line qualifies as total_debt.
assert.equal(isPrintedTotalDebtLabel("Borrowing & Capex -> Total Debt (in cr)"), true, "Solar Q4 FY26 presentation");
assert.equal(isPrintedTotalDebtLabel("Total debts to total assets"), true);
assert.equal(isPrintedTotalDebtLabel("AUDITED CONSOLIDATED BALANCE SHEET"), false, "Q4 OCR row (940.32 -> 932.71) is refused");
assert.equal(isPrintedTotalDebtLabel("Borrowings, non-current + Borrowings, current"), false, "no model-made sums");

// 2. Order book is a balance at a date.
assert.equal(normalizeComparisonBasis("execution", "order_book", "sequential_quarter"), "point_in_time_prior_period");
assert.equal(normalizeComparisonBasis("execution", "order_inflow", "same_quarter_prior_year"), "same_quarter_prior_year", "inflow is a flow");

// 3. Per-quarter standard metrics: order book and total debt win when present.
const row = (id: string, factor: string, metric: string, label = metric) =>
  ({ candidate_id: id, factor_id: factor, canonical_metric_id: metric, current_source_locator: { quoted_label: label } });
const evidence = (rows: any[]) => ({ candidates: rows, validations: rows.map((r) => ({ candidate_id: r.candidate_id })), diagnostics: [] as any[] });
const standardised = preferStandardMetrics(evidence([row("a", "execution", "order_book"), row("b", "execution", "segment_revenue", "Defence"),
  row("c", "balance_sheet", "total_debt", "Total Debt"), row("d", "balance_sheet", "net_debt", "Net Debt"), row("e", "earnings", "revenue")]));
assert.deepEqual(standardised.candidates.map((r) => r.candidate_id), ["a", "c", "e"]);
assert.deepEqual(standardised.validations.map((v) => v.candidate_id), ["a", "c", "e"]);
assert.deepEqual(standardised.diagnostics.map((d) => `${d.factor}:${d.set_aside}`), ["execution:segment_revenue", "balance_sheet:net_debt"]);
assert.equal(preferStandardMetrics(evidence([row("x", "execution", "segment_revenue", "Defence")])).candidates.length, 1, "no order book: segments kept");

// 4. Across quarters: order book when every quarter has it ...
const quarter = (periodEnd: string, rows: any[]): QuarterEvidence => ({ periodEnd, ...evidence(rows), documents: [] });
const allOrderBook = alignExecutionAcrossQuarters([
  quarter("2025-12-31", [row("q3o", "execution", "order_book"), row("q3s", "execution", "segment_revenue", "Defence")]),
  quarter("2026-03-31", [row("q4o", "execution", "order_book")]),
  quarter("2026-06-30", [row("q1o", "execution", "order_book"), row("q1s", "execution", "segment_revenue", "Domestic Explosives")]),
]);
assert.equal(allOrderBook.aligned && allOrderBook.measure, "order_book");
assert.deepEqual(allOrderBook.aligned && allOrderBook.quarters.map((q) => q.candidates.map((c) => c.candidate_id).join()), ["q3o", "q4o", "q1o"]);

// ... otherwise only segments common to all quarters (Solar's real tables: only Defence is in both layouts).
const solarSegments = alignExecutionAcrossQuarters([
  quarter("2025-12-31", ["CIL", "Non-CIL & Institutional", "Housing and Infrastructure", "Defence", "Exports and Overseas"]
    .map((label, i) => row(`q3-${i}`, "execution", "segment_revenue", label))),
  quarter("2026-03-31", ["CIL", "Non-CIL & Institutional", "Defence", "Exports and Overseas"].map((label, i) => row(`q4-${i}`, "execution", "segment_revenue", label))
    .concat([row("q4-ob", "execution", "order_book")])),
  quarter("2026-06-30", ["Domestic Explosives", "International Explosives", "Defence"].map((label, i) => row(`q1-${i}`, "execution", "segment_revenue", label))
    .concat([row("q1-rev", "earnings", "revenue")])),
]);
assert.equal(solarSegments.aligned, true);
if (solarSegments.aligned) {
  assert.equal(solarSegments.measure, "segment_revenue");
  assert.deepEqual(solarSegments.segments, ["Defence"], "canonical label keeps the issuer's own wording");
  assert.deepEqual(solarSegments.quarters.map((q) => q.candidates.map((c) => c.candidate_id).join()), ["q3-3", "q4-2", "q1-2,q1-rev"],
    "only Defence kept; a lone order book is not a series; other factors untouched");
}
const none = alignExecutionAcrossQuarters([
  quarter("2026-03-31", [row("a", "execution", "segment_revenue", "Defence")]),
  quarter("2026-06-30", [row("b", "execution", "segment_revenue", "Domestic Explosives")]),
]);
assert.equal(none.aligned, false);
if (!none.aligned) assert.equal(none.reason, "no_common_execution_measure");

// 5. Segments stay part of the series identity in history.
const impact = (factor: string, metric: string, label: string, end: string, basis = "same_quarter_prior_year", quoted = metric) => ({
  metric_id: metric, comparison_basis: basis, consolidation_basis: "consolidated", canonical_unit: "INR crore",
  previous_value: 1, current_value: 2, previous_document_id: "d1", current_document_id: "d2",
  previous_period: { label: "prior", end_date: "2025-01-01" }, current_period: { label, end_date: end },
  current_source_locator: { quoted_label: quoted } });
const score = (end: string, label: string, segments: string[]) => ({ symbol: "SOLARINDS", score_publishable: true, raw_score: 0.9, fcs_score: 72,
  methodology_id: "m", impact_policy_id: "p", factors: [
    { factor_id: "earnings", impacts: [impact("earnings", "revenue", label, end)] },
    { factor_id: "economics", impacts: [impact("economics", "ebitda_margin", label, end)] },
    { factor_id: "execution", impacts: segments.map((s) => impact("execution", "segment_revenue", label, end, "same_quarter_prior_year", s)) },
    { factor_id: "balance_sheet", impacts: [impact("balance_sheet", "total_debt", "As on", end.replace(/06-30$/, "03-31"), "point_in_time_prior_period", "Total Debt")] },
  ] });
const definitions = historyMetricDefinitions(score("2026-06-30", "Q1 FY27", ["Domestic Explosives", "International Explosives"]));
assert.deepEqual(definitions.filter((d) => d.metric === "segment_revenue").map((d) => d.source_label), ["domestic explosives", "international explosives"]);
assert.equal(lockedSourceLabel({ metric_id: "segment_revenue", current_source_locator: { quoted_label: "Defence" } }), "defence");
const key = (s: any) => checkpointFromScore({ symbol: "SOLARINDS", score: s, informationCutoff: "2026-10-19", calculatedAt: "t", sourceJobId: "t" })!.comparabilityKey;
assert.equal(key(score("2026-06-30", "Q1 FY27", ["Defence"])), key(score("2026-03-31", "Q4 FY26", ["Defence"])), "same segment: comparable");
assert.notEqual(key(score("2026-06-30", "Q1 FY27", ["Domestic Explosives"])), key(score("2026-03-31", "Q4 FY26", ["Defence"])), "different segments: not comparable");

console.log("FCS standard metrics (order book, printed Total Debt) and cross-quarter segment alignment verified.");
