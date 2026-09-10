import assert from "node:assert/strict";
import { buildExpectationDeliveryInputFromDossier } from "../src/dossier-expectation-bridge.ts";
import { assessExpectationDelivery } from "../src/expectation-delivery.ts";
import type { ResearchDossier } from "../src/dossier.ts";

const quarters = [
  ["Q4 FY25", 100, 18], ["Q1 FY26", 110, 18.5], ["Q2 FY26", 120, 19],
  ["Q3 FY26", 130, 19.5], ["Q4 FY26", 115, 20], ["Q1 FY27", 132, 21],
].map(([period, revenueCr, ebitdaMarginPct]) => ({
  period: String(period), basis: "consolidated" as const, revenueCr: Number(revenueCr), ebitdaCr: null,
  ebitdaMarginPct: Number(ebitdaMarginPct), patCr: null, eps: null, sourceIds: ["official-001"],
}));
const dossier: ResearchDossier = {
  schemaVersion: "1.0.0", reportId: "TEST-1", generatedAt: "2026-09-10T00:00:00Z",
  company: { symbol: "TEST", name: "Test Ltd.", exchange: "NSE", sector: "Test", officialDomains: ["example.com"] },
  sections: {
    snapshot: [{ claimId: "claim-001", text: "The company remains debt-free.", sourceIds: ["official-001"], status: "supported" }],
    developments: [], operatingEvidence: [], managementCommitments: [], risks: [],
  },
  quarterlyPerformance: quarters,
  sources: [{ sourceId: "official-001", url: "https://example.com/report.pdf", sourceClass: "company_official", publishedAt: "2026-07-01", retrievedAt: "2026-09-10T00:00:00Z" }],
  marketConversation: { status: "disabled", affectsBms: false, sampleSize: 0, sentiment: { positive: 0, neutral: 1, negative: 0 }, themes: [] },
  qualityControl: { unsupportedClaims: 0, conflicts: 0, humanReviewRequired: true },
};
const input = buildExpectationDeliveryInputFromDossier(dossier, {
  lifecycle: "Building", lifecycleFreezeDate: "2026-08-25", expectationFreezeDate: "2026-09-10", sectorValuationPercentile: 30,
});
assert.equal(input.assessmentMode, "reconstructed_today");
assert.equal(input.qualityGates.find(gate => gate.id === "leverage_coverage")?.result, "pass");
assert.equal(input.deliveryMetrics[0].expected, 15);
assert.equal(input.deliveryMetrics[0].actual, 20);
assert.equal(input.deliveryMetrics[1].expected, 20);
assert.equal(input.deliveryMetrics[1].actual, 21);
assert.equal(input.deliveryMetrics[2].actual, null);
const assessment = assessExpectationDelivery(input);
assert.equal(assessment.deliveryCoverage, 60);
assert.equal(assessment.deliveryDirection, "ahead");
assert.equal(assessment.qualityStatus, "insufficient_evidence");
assert.equal(assessment.gapClassification, "insufficient_evidence");
console.log("PASS: cited dossier evidence builds a conservative reconstructed expectation-delivery input.");
