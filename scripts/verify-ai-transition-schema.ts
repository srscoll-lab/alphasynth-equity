import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AI_EXPOSURE_DIMENSIONS,
  AI_READINESS_DIMENSIONS,
  normalizeAiTransitionAssessment,
} from "../src/ai-transition-schema";

assert.equal(AI_EXPOSURE_DIMENSIONS.reduce((sum, item) => sum + item.weight, 0), 1);
assert.equal(AI_READINESS_DIMENSIONS.reduce((sum, item) => sum + item.weight, 0), 1);

const pilot = JSON.parse(fs.readFileSync(new URL("./ai-transition-pilot.json", import.meta.url), "utf8"));
assert.equal(pilot.length, 12);
assert.ok(pilot.some((company: any) => company.ticker === "INTELLECT"));
assert.equal(new Set(pilot.map((company: any) => company.ticker)).size, pilot.length);

const dimensions = (definitions: ReadonlyArray<{ id: string }>, score: number) =>
  definitions.map((definition) => ({ id: definition.id, score, explanation: "Evidence-bound test", evidenceIds: ["official-001"] }));

const pointInTime = normalizeAiTransitionAssessment({
  symbol: "INTELLECT",
  companyName: "Intellect Design Arena",
  businessModel: "vertical_software",
  assessmentAsOf: "2025-05-09",
  assessmentMode: "point_in_time",
  exposure: { dimensions: dimensions(AI_EXPOSURE_DIMENSIONS, 45) },
  readiness: { dimensions: dimensions(AI_READINESS_DIMENSIONS, 75) },
  evidence: [{ evidenceId: "official-001", sourceType: "results", publishedAt: "2025-05-09", url: "https://example.com/filing" }],
});
assert.equal(pointInTime.classification, "resilient");
assert.equal(pointInTime.eligibleForBacktest, true);

const reconstructed = normalizeAiTransitionAssessment({ ...pointInTime, assessmentMode: "reconstructed_today" });
assert.equal(reconstructed.eligibleForBacktest, false);
assert.equal(reconstructed.operatingMetrics, null);

const sparse = normalizeAiTransitionAssessment({
  symbol: "SMALLIT",
  companyName: "Small IT Company",
  assessmentAsOf: "2025-03-31",
  exposure: { dimensions: [{ id: "task_automability", score: 80 }] },
  readiness: { dimensions: [] },
});
assert.equal(sparse.exposure.score, null);
assert.equal(sparse.classification, "insufficient_evidence");

const explicitMissing = normalizeAiTransitionAssessment({
  symbol: "MISSING",
  companyName: "Explicit Missing Test",
  assessmentAsOf: "2025-03-31",
  exposure: { dimensions: AI_EXPOSURE_DIMENSIONS.map((item) => ({ id: item.id, score: null })) },
  readiness: { dimensions: AI_READINESS_DIMENSIONS.map((item) => ({ id: item.id, score: null })) },
});
assert.equal(explicitMissing.exposure.coverage, 0);
assert.equal(explicitMissing.readiness.coverage, 0);

console.log("AI transition schema verification passed.");
