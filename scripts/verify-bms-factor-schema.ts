import assert from "node:assert/strict";
import {
  BMS_FACTOR_DEFINITIONS,
  BMS_FACTOR_SCHEMA_DESCRIPTION,
  normalizeBmsFactorAnalysis,
} from "../src/bms-factor-schema";

const legacy = normalizeBmsFactorAnalysis({
  symbol: "TEST",
  period: "Q1 FY27",
  earnings: 0.8,
  economics: 0.6,
  execution: 0.4,
  balance_sheet: 0.2,
  management_delivery: 0,
});

assert.equal(legacy.factors.length, 5);
assert.equal(legacy.factors[0].current.factorScore, 0.8);
assert.equal(legacy.factors[0].previous.factorScore, null);
assert.equal(legacy.factors[0].factorScoreChange, null);
assert.equal(legacy.factors[0].weightedContribution, null);
assert.equal(legacy.factors[0].availability, "partial");
assert.equal(legacy.factors[4].current.factorScore, 0);
assert.equal(legacy.factors[4].availability, "partial");

const complete = normalizeBmsFactorAnalysis({
  period: "Q1 FY27",
  factor_analysis: {
    generated_at: "2026-08-01T00:00:00Z",
    factors: [{
      id: "earnings",
      previous: {
        period: "Q1 FY26",
        factor_score: 0.4,
        metrics: [{ key: "pat_growth", label: "PAT growth", value: 8.2, unit: "%" }],
      },
      current: {
        period: "Q1 FY27",
        factor_score: 0.8,
        metrics: [{ key: "pat_growth", label: "PAT growth", value: 18.6, unit: "%" }],
      },
      explanation: "Earnings momentum improved as profit growth accelerated.",
      evidence_refs: ["official-001"],
      confidence: "high",
    }],
  },
});

const earnings = complete.factors[0];
assert.equal(earnings.availability, "complete");
assert.ok(Math.abs((earnings.factorScoreChange ?? 0) - 0.4) < 1e-9);
assert.ok(Math.abs((earnings.weightedContribution ?? 0) - 0.1) < 1e-9);
assert.equal(earnings.previous.metrics[0].value, 8.2);
assert.equal(earnings.current.metrics[0].value, 18.6);
assert.deepEqual(earnings.evidenceRefs, ["official-001"]);
assert.equal(complete.factors[1].availability, "unavailable");

assert.equal(BMS_FACTOR_DEFINITIONS.reduce((sum, factor) => sum + factor.weight, 0), 1);
assert.equal(BMS_FACTOR_SCHEMA_DESCRIPTION.methodologyVersion, "BMS_V1");
console.log("BMS factor schema verification passed.");
