import assert from "node:assert/strict";
import {
  buildFcsEvidencePreflightSnapshot,
  fcsEvidencePreflightForSymbol,
  approvedHighProbabilityEvidence,
} from "../src/fcs-evidence-preflight.ts";

const snapshot = buildFcsEvidencePreflightSnapshot();
assert.equal(snapshot.priorityBatch.selection, "all_large_cap_companies");
assert.equal(snapshot.priorityBatch.targetCount, 100);
assert.equal(snapshot.summary.total, 100);
assert.equal(snapshot.policy.baselineUsesModelCalls, false);
assert.equal(snapshot.summary.byStatus.report_ready, 34);
assert.equal(snapshot.summary.byStatus.high_probability, 0);
assert.equal(snapshot.summary.byStatus.partial, 66);
assert.equal(snapshot.summary.byStatus.unavailable, 0);
assert.ok(snapshot.priorityBatch.records.every((record) => record.capSegment === "Large cap"));
assert.ok(snapshot.priorityBatch.records.every((record) => record.requestEnabled === false));

const hcl = fcsEvidencePreflightForSymbol("HCLTECH");
assert.equal(hcl.status, "report_ready");
assert.equal(hcl.action, "view_report");
assert.equal(hcl.evidence.publishedFourFactorReport, true);

const unverifiedLargeCap = snapshot.priorityBatch.records.find((record) => record.status === "partial");
assert.ok(unverifiedLargeCap);
assert.equal(unverifiedLargeCap.requestEnabled, false);
assert.ok(unverifiedLargeCap.reasonCodes.includes("four_factor_evidence_not_verified"));

const outside = fcsEvidencePreflightForSymbol("VIJIFIN");
assert.equal(outside.status, "unavailable");
assert.equal(outside.action, "deep_dive_only");

assert.equal(approvedHighProbabilityEvidence({
  symbol: "TEST",
  checkedAt: "2026-10-09T12:00:00Z",
  evidenceCutoff: "2026-10-09",
  currentDocument: { url: "https://issuer.example/current.pdf", publishedAt: "2026-08-01", readable: true, official: true },
  comparableDocument: { url: "https://issuer.example/previous.pdf", publishedAt: "2025-08-01", readable: true, official: true },
  factorFamilies: ["earnings", "economics", "execution", "balance_sheet"],
}), true);
assert.equal(approvedHighProbabilityEvidence({
  symbol: "TEST",
  checkedAt: "2026-10-09T12:00:00Z",
  evidenceCutoff: "2026-10-09",
  currentDocument: { url: "https://issuer.example/current.pdf", publishedAt: "2026-08-01", readable: true, official: true },
  comparableDocument: { url: "https://issuer.example/previous.pdf", publishedAt: "2025-08-01", readable: true, official: true },
  factorFamilies: ["earnings", "economics", "balance_sheet"],
}), false, "Three factors must never enable a request.");

console.log(JSON.stringify(snapshot.summary, null, 2));
