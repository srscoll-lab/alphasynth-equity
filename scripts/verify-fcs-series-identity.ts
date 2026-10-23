import assert from "node:assert/strict";
import { alignExecutionAcrossQuarters, rowsOutOfSeries, type QuarterEvidence } from "../src/fcs-segment-alignment.ts";
import { executionLabelHint, historyMetricDefinitions } from "../src/fundamental-review-history.ts";

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

console.log("Execution series identity: printed noun as hint, same business by size, no forced series — verified.");
