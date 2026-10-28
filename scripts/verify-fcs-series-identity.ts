import assert from "node:assert/strict";
import { alignExecutionAcrossQuarters, rowsOutOfSeries, type QuarterEvidence } from "../src/fcs-segment-alignment.ts";
import { executionLabelHint, historyMetricDefinitions } from "../src/fundamental-review-history.ts";
import { normalizeComparisonBasis } from "../src/fcs-comparison-basis.ts";
import { quarterPeriodMismatch, tapetideExecutionEvidence } from "../src/tapetide-fcs-documents.ts";

// Real rows from the 23 Oct beta run (Eicher): the current quarter's label is generic and the
// earlier calls also give VECV truck volumes.
const row = (id: string, end: string, label: string, prev: number, cur: number, unit = "units", metric = "sales_volume") => ({
  candidate_id: id, factor_id: "execution", canonical_metric_id: metric, source_metric_label: label, canonical_unit: unit,
  previous_canonical_value: prev, current_canonical_value: cur, current_period: { end_date: end },
  current_source_locator: { quoted_label: `${label} — x`, unit_wording: "motorcycles" }, previous_source_locator: { quoted_label: `${label} — y` } });
const quarter = (periodEnd: string, rows: any[]): QuarterEvidence => ({ periodEnd, candidates: rows, validations: rows.map((r) => ({ candidate_id: r.candidate_id })), documents: [] });

// 1. The printed noun steers history when the label is generic.
assert.equal(executionLabelHint({ current_source_locator: { quoted_label: "quarter sales — Q1 FY27 (company document text)", unit_wording: "motorcycles" } }), "motorcycles");
assert.equal(executionLabelHint({ current_source_locator: { quoted_label: "Domestic Explosives — Q1 FY27", unit_wording: "Rs crores" } }), "Domestic Explosives");
assert.equal(historyMetricDefinitions({ factors: [{ factor_id: "execution", impacts: [{ metric_id: "sales_volume",
  current_source_locator: { quoted_label: "quarter sales — Q1 FY27", unit_wording: "motorcycles" } }] }] })[0].label_hint, "motorcycles");

// 2. Same business by size: Royal Enfield (~3 lakh a quarter) is kept, VECV (~25,000) is left out.
const q1 = quarter("2026-06-30", [row("q1", "2026-06-30", "quarter sales", 261326, 332940)]);
const q4 = quarter("2026-03-31", [row("q4-re", "2026-03-31", "Total Volumes", 280801, 313811), row("q4-vecv", "2026-03-31", "Total Volumes", 31070, 34012)]);
const q3 = quarter("2025-12-31", [row("q3-hd", "2025-12-31", "HD Trucks", 5428, 6303), row("q3-re", "2025-12-31", "motorcycles", 269039, 325773)]);
assert.deepEqual([...rowsOutOfSeries([q3, q4, q1])].sort(), ["q3-hd", "q4-vecv"]);
const aligned = alignExecutionAcrossQuarters([q3, q4, q1]);
assert.equal(aligned.aligned, true, JSON.stringify(aligned.segmentsByQuarter));
assert.equal(aligned.measure, "sales_volume");
assert.deepEqual(aligned.quarters.map((q) => q.candidates.map((c) => c.candidate_id).join()), ["q3-re", "q4-re", "q1"]);

// 3. An earlier quarter with only the other business is not forced into the series.
const onlyVecv = alignExecutionAcrossQuarters([quarter("2025-12-31", [row("q3-hd", "2025-12-31", "HD Trucks", 5428, 6303)]), q4, q1]);
assert.equal(onlyVecv.aligned, false, "no motorcycle row in Q3: lifecycle stays pending rather than mixing businesses");

// 4. Segments, percentages and order books are not size-filtered.
const pct = (id: string, end: string, cur: number) => row(id, end, "Capacity utilisation", 70, cur, "percent", "capacity_utilization");
assert.equal(rowsOutOfSeries([quarter("2025-12-31", [pct("a", "2025-12-31", 30)]), quarter("2026-06-30", [pct("b", "2026-06-30", 90)])]).size, 0);
const seg = (id: string, end: string, label: string, cur: number) => row(id, end, label, 1, cur, "INR crore", "segment_revenue");
assert.equal(rowsOutOfSeries([quarter("2025-12-31", [seg("a", "2025-12-31", "Cables", 2241), seg("b", "2025-12-31", "Lighting", 423)]),
  quarter("2026-06-30", [seg("c", "2026-06-30", "Cables", 2456)])]).size, 0);

// 5. Thermax (24 Oct beta): each quarter has the order book twice (vs a year ago and vs last quarter)
//    plus order inflow; one comparison per quarter is kept — the year-on-year one.
const ob = (id: string, end: string, prevEnd: string, prev: number, cur: number) => ({ ...row(id, end, "Order Balance", prev, cur, "INR crore", "order_book"),
  comparison_basis: "point_in_time_prior_period", previous_period: { end_date: prevEnd } });
const inflow = (id: string, end: string) => ({ ...row(id, end, "Order Booking", 2700, 2800, "INR crore", "order_inflow"), previous_period: { end_date: `${Number(end.slice(0, 4)) - 1}${end.slice(4)}` } });
const thermax = alignExecutionAcrossQuarters([
  quarter("2025-12-31", [ob("q3-yoy", "2025-12-31", "2024-12-31", 10500, 12100), ob("q3-qoq", "2025-12-31", "2025-09-30", 11900, 12100), inflow("q3-in", "2025-12-31")]),
  quarter("2026-03-31", [ob("q4-yoy", "2026-03-31", "2025-03-31", 11000, 13604), ob("q4-qoq", "2026-03-31", "2025-12-31", 12100, 13604), inflow("q4-in", "2026-03-31")]),
  quarter("2026-06-30", [ob("q1-yoy", "2026-06-30", "2025-06-30", 11376, 14045), ob("q1-qoq", "2026-06-30", "2026-03-31", 13604, 14045), inflow("q1-in", "2026-06-30")]),
]);
assert.equal(thermax.aligned, true, JSON.stringify(thermax.segmentsByQuarter));
assert.equal(thermax.measure, "order_book");
assert.deepEqual(thermax.quarters.map((q) => q.candidates.map((c) => c.candidate_id).join()), ["q3-yoy", "q4-yoy", "q1-yoy"]);

// 6. DMart (24 Oct beta): store count is a balance at a date, whatever basis the model wrote.
assert.equal(normalizeComparisonBasis("execution", "store_count", "same_quarter_prior_year"), "point_in_time_prior_period");
assert.equal(normalizeComparisonBasis("execution", "store_count", "point_in_time_prior_period"), "point_in_time_prior_period");
assert.equal(normalizeComparisonBasis("execution", "sales_volume", "same_quarter_prior_year"), "same_quarter_prior_year", "volumes stay flows");
const stores = (basis: string, end: string, prevEnd: string, text: string) => tapetideExecutionEvidence({ symbol: "DMART", companyName: "Avenue Supermarts", cutoff: "2026-10-24",
  targetPeriodEnd: end, metrics: [{ metric: "store_count", units: ["count"] }], archive: async (_b, sha) => `gs://t/${sha}.md`, fetchText: async () => text,
  callTool: async () => ({ data: { documents: [{ doc_id: 7, doc_type: "presentation", has_markdown: true, links: { markdown_url: "https://filings.tapetide.com/d.md" },
    doc_date: new Date(Date.parse(`${end}T00:00:00Z`) + 40 * 86_400_000).toISOString().slice(0, 10) }] } }),
  extract: async () => [{ metricName: "store_count", previousPeriod: prevEnd === "2025-06-30" ? "Q1/26" : "FY25", currentPeriod: prevEnd === "2025-06-30" ? "Q1/27" : "FY26",
    previousPeriodEndDate: prevEnd, currentPeriodEndDate: end, previousValue: prevEnd === "2025-06-30" ? 424 : 415, currentValue: prevEnd === "2025-06-30" ? 503 : 500,
    unit: "count", quotedLabel: "Total Stores", comparisonBasis: basis }] });
const q1Stores = await stores("same_quarter_prior_year", "2026-06-30", "2025-06-30", "<!-- page 3 -->\nQ1 FY27 update. Total Stores Q1/26 424 Q1/27 503 (as of 30 June 2026 vs 30 June 2025)");
const q4Stores = await stores("point_in_time_prior_period", "2026-03-31", "2025-03-31", "<!-- page 3 -->\nQ4 FY26 update. Stores FY25 415 FY26 500 Total Stores (as of 31 March 2026)");
assert.deepEqual([q1Stores.candidates[0]?.comparison_basis, q4Stores.candidates[0]?.comparison_basis], ["point_in_time_prior_period", "point_in_time_prior_period"],
  "both quarters now carry the same basis, so they share one series identity");
assert.equal((await stores("same_quarter_prior_year", "2026-06-30", "2025-06-30", "<!-- page 3 -->\nQ1 FY27 update. Total Stores Q1/26 424 Q1/27 503")).candidates.length, 1,
  "'Q1/26' names its year (DMart's table style), so no date is needed nearby");

// 7. Power Grid (28 Oct beta): a quarter compares two quarters. Full-year and year-to-date rows are
//    refused for a flow; balances ("as at") are not affected; capital work-in-progress is not an order book.
const span = (previousPeriod: string, currentPeriod: string, previousPeriodEndDate: string, currentPeriodEndDate: string) =>
  ({ previousPeriod, currentPeriod, previousPeriodEndDate, currentPeriodEndDate });
assert.equal(quarterPeriodMismatch(span("Q1FY26", "Q1FY27", "2025-06-30", "2026-06-30"), "same_quarter_prior_year"), null);
assert.equal(quarterPeriodMismatch(span("FY25", "FY26", "2025-03-31", "2026-03-31"), "same_quarter_prior_year"), "period_not_a_quarter");
assert.equal(quarterPeriodMismatch(span("FY25", "Upto Dec'25", "2025-03-31", "2025-12-31"), "same_quarter_prior_year"), "period_not_a_quarter");
assert.equal(quarterPeriodMismatch(span("9M FY25", "9M FY26", "2024-12-31", "2025-12-31"), "same_quarter_prior_year"), "period_not_a_quarter");
assert.equal(quarterPeriodMismatch(span("Q3 FY26", "Q3 FY26", "2025-03-31", "2025-12-31"), "same_quarter_prior_year"), "previous_period_not_matching_basis");
assert.equal(quarterPeriodMismatch(span("Q4 FY26", "Q1 FY27", "2026-03-31", "2026-06-30"), "sequential_quarter"), null);
assert.equal(quarterPeriodMismatch(span("Q1/26", "Q1/27", "2025-06-30", "2026-06-30"), "same_quarter_prior_year"), null, "DMart table style");
assert.equal(quarterPeriodMismatch(span("FY25", "FY26", "2025-03-31", "2026-03-31"), "point_in_time_prior_period"), null, "balances as at 31 Mar");
const grid = (rows: any[]) => tapetideExecutionEvidence({ symbol: "POWERGRID", companyName: "Power Grid", cutoff: "2026-10-28", targetPeriodEnd: "2026-03-31",
  metrics: [{ metric: "transmission_availability", units: ["percent"] }, { metric: "order_book", units: ["INR crore"] }], archive: async (_b, sha) => `gs://t/${sha}.md`,
  fetchText: async () => "<!-- page 4 -->\nQ4 FY26 results. AVAILABILITY (%) FY25 99.81 FY26 99.84; AVAILABILITY (%) Q4 FY25 99.72 Q4 FY26 99.86; Capital Work-in-Progress As on 31.03.25 41,000 As on 31.03.26 48,500 crore",
  callTool: async () => ({ data: { documents: [{ doc_id: 9, doc_type: "presentation", has_markdown: true, links: { markdown_url: "https://filings.tapetide.com/g.md" }, doc_date: "2026-05-15" }] } }),
  extract: async () => rows });
const avail = (previousPeriod: string, currentPeriod: string, previousValue: number, currentValue: number) => ({ metricName: "transmission_availability", previousPeriod, currentPeriod,
  previousPeriodEndDate: "2025-03-31", currentPeriodEndDate: "2026-03-31", previousValue, currentValue, unit: "percent", quotedLabel: "AVAILABILITY (%)", comparisonBasis: "same_quarter_prior_year" });
const gridQ4 = await grid([avail("FY25", "FY26", 99.81, 99.84), avail("Q4 FY25", "Q4 FY26", 99.72, 99.86),
  { metricName: "order_book", previousPeriod: "As on 31.03.25", currentPeriod: "As on 31.03.26", previousPeriodEndDate: "2025-03-31", currentPeriodEndDate: "2026-03-31",
    previousValue: 41000, currentValue: 48500, unit: "INR crore", quotedLabel: "Capital Work-in-Progress", comparisonBasis: "point_in_time_prior_period" }]);
assert.deepEqual(gridQ4.candidates.map((c) => `${c.canonical_metric_id}:${c.previous_canonical_value}->${c.current_canonical_value}`), ["transmission_availability:99.72->99.86"],
  "only the quarterly availability row is kept");
assert.deepEqual(gridQ4.diagnostics.filter((d) => /period_not_a_quarter|label_is_not_order_book/.test(String(d.outcome))).map((d) => d.outcome),
  ["period_not_a_quarter", "label_is_not_order_book"]);

console.log("Execution series identity: printed noun as hint, same business by size, no forced series, one comparison per measure, stock basis, quarter-only periods — verified.");
