import assert from "node:assert/strict";
import { anchorsForEvidencePeriod, canonicalizeDynamicEvidence } from "../src/fundamental-review-dynamic-evidence.ts";

const quarterAnchors = [{ current_period_end_date: "2025-12-31" }, { current_period_end_date: "2026-03-31" }, {}];
assert.deepEqual(anchorsForEvidencePeriod(quarterAnchors, "2026-03-31"), [quarterAnchors[1]]);
assert.deepEqual(anchorsForEvidencePeriod(quarterAnchors, "2026-06-30"), []);
assert.equal(anchorsForEvidencePeriod(quarterAnchors, ""), quarterAnchors);

const base = {
  ticker: "TESTCO",
  company_name: "Test Company Limited",
  information_cutoff: "2026-10-01",
};
const factors = [
  ["earnings", "revenue", "INR crore"],
  ["economics", "ebitda_margin", "percent"],
  ["execution", "sales_volume", "units"],
  ["balance_sheet", "net_debt", "INR crore"],
] as const;
const rows = factors.map(([factor, metric, unit], index) => ({
  factor,
  metric_name: metric,
  previous_period: "Q1 FY26",
  current_period: "Q1 FY27",
  previous_period_end_date: "2025-06-30",
  current_period_end_date: "2026-06-30",
  comparison_basis: "same_quarter_prior_year",
  consolidation_basis: factor === "execution" ? "not_applicable" : "consolidated",
  previous_value: 100 + index,
  current_value: 110 + index,
  unit,
  source_type: "company_filing",
  source_ref: `https://example.com/results-${index}.pdf`,
  source_date: "2026-07-20",
  cutoff_date: "2026-10-01",
  confidence: 0.9,
  quoted_label: `${metric} Q1 comparison`,
  document_sha256: String(index + 1).padStart(64, "a"),
  archived_document_uri: `gs://evidence-bucket/results-${index}.pdf`,
  media_type: "application/pdf",
  content_length: 1000 + index,
}));

const result = canonicalizeDynamicEvidence({ ...base, rows, diagnostics: [] });
assert.equal(result.symbol, "TESTCO");
assert.equal(result.candidates.length, 4);
assert.equal(result.documents.length, 4);
assert.equal(result.validations.length, 4);
assert.equal(new Set(result.candidates.map((candidate) => candidate.factor_id)).size, 4);
assert.equal(result.diagnostics.at(-1)?.outcome, "dynamic_four_factor_evidence_ready");

const rejected = canonicalizeDynamicEvidence({
  ...base,
  rows: [{ ...rows[0], consolidation_basis: "unknown", archived_document_uri: "" }],
});
assert.equal(rejected.candidates.length, 0);
assert.equal(rejected.diagnostics[0].outcome, "dynamic_row_not_canonical");
const pairedRow = { ...rows[0], previous_document: { source_ref: "https://example.com/prior.pdf",
  source_date: "2025-07-20", document_sha256: "b".repeat(64), archived_document_uri: "gs://evidence-bucket/prior.pdf",
  media_type: "application/pdf", content_length: 1000 } };
const paired = canonicalizeDynamicEvidence({ ...base, rows: [pairedRow] });
assert.equal(paired.documents.length, 2);
assert.notEqual(paired.candidates[0].previous_document_id, paired.candidates[0].current_document_id);
assert.equal(paired.documents.find(d => d.document_id === paired.candidates[0].previous_document_id)?.published_at, "2025-07-20T00:00:00.000Z");
assert.equal(canonicalizeDynamicEvidence({ ...base, rows: [{ ...pairedRow, previous_document: { ...pairedRow.previous_document, archived_document_uri: "" } }] }).candidates.length, 0);
assert.equal(canonicalizeDynamicEvidence({ ...base, rows: [{ ...pairedRow, previous_document: { ...pairedRow.previous_document, source_date: "2026-10-02" } }] }).candidates.length, 0);

console.log("Dynamic Fundamental Review evidence adapter verified.");
