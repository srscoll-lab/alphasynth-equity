import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeAiTransitionAssessment } from "../src/ai-transition-schema";

const raw = JSON.parse(fs.readFileSync(new URL("./ai-transition-intellect-history.json", import.meta.url), "utf8"));
assert.equal(raw.length, 4);
const history = raw.map(normalizeAiTransitionAssessment);

for (const assessment of history) {
  assert.equal(assessment.symbol, "INTELLECT");
  assert.equal(assessment.assessmentMode, "reconstructed_today");
  assert.equal(assessment.eligibleForBacktest, false);
  assert.ok(assessment.exposure.coverage >= 0.6);
  assert.ok(assessment.readiness.coverage >= 0.6);
  assert.ok(assessment.evidence.every((item) => new URL(item.url).hostname.endsWith("intellectdesign.com")));
  assert.equal(assessment.operatingMetrics?.aiRevenue, null);
  const evidenceIds = new Set(assessment.evidence.map((item) => item.evidenceId));
  for (const dimension of [...assessment.exposure.dimensions, ...assessment.readiness.dimensions]) {
    assert.ok(dimension.evidenceIds.every((id) => evidenceIds.has(id)), `Missing evidence ${dimension.id}`);
  }
}

assert.deepEqual(history.map((item) => item.assessmentAsOf), [...history.map((item) => item.assessmentAsOf)].sort());
assert.equal(history.at(-1)?.classification, "resilient");
assert.ok((history.at(-1)?.readiness.score || 0) > (history[0].readiness.score || 0));
console.log("AI transition Intellect history verification passed.");
