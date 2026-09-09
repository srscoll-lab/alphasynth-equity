import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeAiTransitionAssessment } from "../src/ai-transition-schema";

const histories = [
  { file: "ai-transition-intellect-history.json", symbol: "INTELLECT", domain: "intellectdesign.com" },
  { file: "ai-transition-tcs-history.json", symbol: "TCS", domain: "tcs.com" },
  { file: "ai-transition-tataelxsi-history.json", symbol: "TATAELXSI", domain: "tataelxsi.com" },
].map((definition) => ({
  ...definition,
  history: JSON.parse(fs.readFileSync(new URL(`./${definition.file}`, import.meta.url), "utf8")).map(normalizeAiTransitionAssessment),
}));

for (const { history, symbol, domain } of histories) {
  assert.equal(history.length, 4);
  for (const assessment of history) {
    assert.equal(assessment.symbol, symbol);
    assert.equal(assessment.assessmentMode, "reconstructed_today");
    assert.equal(assessment.eligibleForBacktest, false);
    assert.ok(assessment.exposure.coverage >= 0.6);
    assert.ok(assessment.readiness.coverage >= 0.6);
    assert.ok(assessment.evidence.every((item) => {
      const hostname = new URL(item.url).hostname;
      return hostname === domain || hostname.endsWith(`.${domain}`);
    }));
    assert.equal(assessment.operatingMetrics?.aiRevenue, null);
    const evidenceIds = new Set(assessment.evidence.map((item) => item.evidenceId));
    for (const dimension of [...assessment.exposure.dimensions, ...assessment.readiness.dimensions]) {
      assert.ok(dimension.evidenceIds.every((id) => evidenceIds.has(id)), `Missing evidence ${dimension.id}`);
    }
  }
  assert.deepEqual(history.map((item) => item.assessmentAsOf), [...history.map((item) => item.assessmentAsOf)].sort());
  assert.ok((history.at(-1)?.readiness.score || 0) > (history[0].readiness.score || 0));
}

assert.equal(histories[0].history.at(-1)?.classification, "resilient");
assert.equal(histories[1].history.at(-1)?.classification, "credible_transition");
assert.equal(histories[2].history.at(-1)?.classification, "credible_transition");
assert.ok(histories[1].history.slice(0, 2).every((item) => item.classification === "business_model_risk"));
assert.ok(histories[2].history.slice(0, 3).every((item) => item.classification === "business_model_risk"));
assert.equal(histories[1].history.at(-1)?.operatingMetrics?.aiAnnualizedRevenueUsdBn, 2.3);
assert.equal(histories[2].history.at(-1)?.operatingMetrics?.aiAnnualizedRevenueUsdBn, null);
console.log("AI transition three-company history verification passed.");
