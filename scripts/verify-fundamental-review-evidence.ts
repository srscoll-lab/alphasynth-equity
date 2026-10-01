import assert from "node:assert/strict";
import { resolve } from "node:path";

import {
  canonicalEvidenceForSymbol,
  loadCanonicalEvidenceBundle,
} from "../src/fundamental-review-evidence.ts";

const bundle = loadCanonicalEvidenceBundle({
  reportPaths: [resolve(process.cwd(), "data", "fundamental-review-approved-five-company-v2.json")],
  approvalPath: resolve(process.cwd(), "data", "fundamental-review-approved-five-company-v2-approval.json"),
});

assert.equal(bundle.candidates.length, 28);
assert.equal(bundle.validations.length, 28);
assert.equal(new Set(bundle.candidates.map((candidate) => candidate.company_symbol)).size, 5);

for (const symbol of ["BAJFINANCE", "HINDALCO", "INFY", "LT", "SUNPHARMA"]) {
  const evidence = canonicalEvidenceForSymbol(bundle, symbol);
  assert.equal(evidence.symbol, symbol);
  assert.ok(evidence.candidates.length >= 4, `${symbol} must have approved comparisons`);
  assert.equal(new Set(evidence.candidates.map((candidate) => candidate.factor_id)).size, 4);
  assert.equal(evidence.validations.length, evidence.candidates.length);
  assert.ok(evidence.documents.length > 0);
  assert.equal(evidence.diagnostics[0].outcome, "approved_four_factor_evidence_ready");
}

const unknown = canonicalEvidenceForSymbol(bundle, "UNKNOWN");
assert.equal(unknown.candidates.length, 0);
assert.equal(unknown.diagnostics[0].outcome, "no_approved_canonical_evidence");

console.log("Canonical V2 Fundamental Review evidence endpoint verified.");
