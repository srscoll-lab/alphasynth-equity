import assert from "node:assert/strict";
import {
  buildFcsEvidencePreflightSnapshot,
  fcsEvidencePreflightForSymbol,
  approvedHighProbabilityEvidence,
  builtInReportCoversLatestQuarter,
  fiscalQuarterEnd,
  latestReportedQuarterEnd,
  providerAssistedFcsPreflight,
} from "../src/fcs-evidence-preflight.ts";

// Built-in reports (information to 25 Aug 2026) still cover the latest reported quarter on 26 Aug.
const BEFORE_Q1_DEADLINE = new Date("2026-08-26T12:00:00Z");
const snapshot = buildFcsEvidencePreflightSnapshot(BEFORE_Q1_DEADLINE);
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

const hcl = fcsEvidencePreflightForSymbol("HCLTECH", BEFORE_Q1_DEADLINE);
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

// Owner decision (28 Oct 2026): an older built-in report no longer blocks a fresh review.
const OCT_28 = new Date("2026-10-28T06:00:00Z");
assert.equal(latestReportedQuarterEnd(OCT_28), "2026-06-30", "Sep quarter results are not all due until 29 Nov");
assert.equal(latestReportedQuarterEnd(new Date("2026-11-30T00:00:00Z")), "2026-09-30");
assert.equal(latestReportedQuarterEnd(new Date("2026-05-29T00:00:00Z")), "2025-12-31", "March results due by 30 May");
assert.equal(fiscalQuarterEnd("Q1 FY27"), "2026-06-30");
assert.equal(fiscalQuarterEnd("Q4 FY26"), "2026-03-31");
assert.equal(fiscalQuarterEnd("Latest comparable reporting period"), null);
assert.equal(builtInReportCoversLatestQuarter({ fcsPeriod: "Q1 FY27", fcsAsOf: "2026-10-23" }, OCT_28), true, "beta's own Q1 FY27 report stays current");
assert.equal(builtInReportCoversLatestQuarter({ fcsPeriod: "Q4 FY26", fcsAsOf: "2026-10-23" }, OCT_28), false);
assert.equal(builtInReportCoversLatestQuarter({ fcsPeriod: "Latest comparable reporting period", fcsAsOf: "2026-08-25" }, OCT_28), false,
  "unnamed quarter, information before the 29 Aug deadline: may be an older quarter");
assert.equal(builtInReportCoversLatestQuarter({ fcsPeriod: "Latest comparable reporting period", fcsAsOf: "2026-09-01" }, OCT_28), true);
const lt = fcsEvidencePreflightForSymbol("LT", OCT_28);
assert.notEqual(lt.status, "report_ready");
assert.ok(lt.reasonCodes.includes("built_in_report_older_quarter"));
assert.equal(lt.evidence.publishedFourFactorReport, true, "the earlier report is still recorded");
const ltBeta = providerAssistedFcsPreflight(lt, true);
assert.equal(ltBeta.requestEnabled, true, "large cap with Tapetide configured: fresh request enabled");
assert.ok(ltBeta.reasonCodes.includes("built_in_report_older_quarter"));
const blocked = ["BAJAJ-AUTO", "LT", "BEL", "INFY", "HCLTECH", "PERSISTENT", "SUNPHARMA", "DRREDDY", "CIPLA", "ULTRACEMCO", "HINDALCO", "TATASTEEL", "TITAN", "TRENT", "BHARTIARTL"];
assert.deepEqual(blocked.filter((symbol) => !providerAssistedFcsPreflight(fcsEvidencePreflightForSymbol(symbol, OCT_28), true).requestEnabled), [],
  "all 15 test companies blocked on 24 Oct can now be requested");

console.log(JSON.stringify(snapshot.summary, null, 2));
