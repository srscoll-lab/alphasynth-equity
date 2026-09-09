import assert from "node:assert/strict";
import { assessExpectationDelivery, expectationDeliveryInputErrors, EXPECTATION_DELIVERY_RULES } from "../src/expectation-delivery.ts";

const base = {
  symbol: "TEST",
  companyName: "Test Company",
  lifecycle: "Emerging",
  lifecycleFreezeDate: "2026-08-25",
  assessmentMode: "prospective" as const,
  expectationFreezeDate: "2026-08-25",
  outcomeDate: "2026-10-31",
  sectorValuationPercentile: 20,
  evidence: [{ id: "official-001", url: "https://example.com/result.pdf", publishedAt: "2026-10-31" }],
  qualityGates: [
    { id: "cash_conversion", label: "Cash conversion", severity: "hard" as const, result: "pass" as const, explanation: null, evidenceRefs: ["official-001"] },
    { id: "concentration", label: "Concentration", severity: "soft" as const, result: "pass" as const, explanation: null, evidenceRefs: ["official-001"] },
  ],
  deliveryMetrics: [
    { id: "revenue", label: "Revenue growth", expected: 10, actual: 14, unit: "%", tolerance: 4, higherIsBetter: true, weight: 0.4, expectationSource: "management_guidance" as const, evidenceRefs: ["official-001"] },
    { id: "margin", label: "Operating margin", expected: 15, actual: 16, unit: "%", tolerance: 1, higherIsBetter: true, weight: 0.3, expectationSource: "management_guidance" as const, evidenceRefs: ["official-001"] },
    { id: "cash", label: "Cash conversion", expected: 80, actual: 92, unit: "%", tolerance: 10, higherIsBetter: true, weight: 0.3, expectationSource: "internal_baseline" as const, evidenceRefs: ["official-001"] },
  ],
};

const candidate = assessExpectationDelivery(base);
assert.equal(candidate.lifecycle, "Emerging");
assert.equal(candidate.lifecycleUnchanged, true);
assert.equal(candidate.qualityStatus, "pass");
assert.equal(candidate.expectationLevel, "low");
assert.equal(candidate.deliveryDirection, "ahead");
assert.equal(candidate.gapClassification, "under_recognised_delivery");
assert.equal(candidate.deliveryCoverage, 100);
assert.deepEqual(expectationDeliveryInputErrors(base), []);

const failed = assessExpectationDelivery({
  ...base,
  qualityGates: [{ id: "auditor", label: "Auditor integrity", severity: "hard", result: "fail", explanation: "Qualified opinion", evidenceRefs: ["official-001"] }],
});
assert.equal(failed.qualityStatus, "fail");
assert.equal(failed.gapClassification, "not_eligible");
assert.deepEqual(failed.hardGateFailures, ["Auditor integrity"]);

const incomplete = assessExpectationDelivery({
  ...base,
  sectorValuationPercentile: null,
  qualityGates: [{ id: "pledge", label: "Promoter pledge", severity: "hard", result: "unknown", explanation: null, evidenceRefs: [] }],
  deliveryMetrics: base.deliveryMetrics.map(metric => ({ ...metric, actual: null })),
});
assert.equal(incomplete.qualityStatus, "insufficient_evidence");
assert.equal(incomplete.deliveryScore, null);
assert.equal(incomplete.gapClassification, "insufficient_evidence");
assert.ok(expectationDeliveryInputErrors({ ...base, sectorValuationPercentile: 120 }).length > 0);

assert.match(EXPECTATION_DELIVERY_RULES.lifecyclePolicy, /never changes/);
assert.match(EXPECTATION_DELIVERY_RULES.evidencePolicy, /never converted to zero/);
console.log("Expectations–delivery overlay verification passed.");
