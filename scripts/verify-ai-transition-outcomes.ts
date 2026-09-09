import assert from "node:assert/strict";
import { addUtcMonths, calculateMarketOutcome } from "../src/ai-transition-outcomes";

assert.equal(addUtcMonths("2024-04-12", 3), "2024-07-12");
const points = [
  { date: "2024-04-15", adjustedClose: 100 },
  { date: "2024-07-12", adjustedClose: 112 },
];
const benchmark = [
  { date: "2024-04-12", adjustedClose: 190 },
  { date: "2024-04-15", adjustedClose: 200 },
  { date: "2024-07-12", adjustedClose: 210 },
];
const complete = calculateMarketOutcome({ symbol: "TEST", benchmark: "INDEX", assessmentAsOf: "2024-04-12", horizonMonths: 3, observedThrough: "2024-07-12", companyPoints: points, benchmarkPoints: benchmark });
assert.equal(complete.companyReturnPct, 12);
assert.equal(complete.benchmarkReturnPct, 5);
assert.equal(complete.relativeReturnPct, 7);
assert.equal(complete.interpretation, "outperformed");
const pending = calculateMarketOutcome({ symbol: "TEST", benchmark: "INDEX", assessmentAsOf: "2026-04-09", horizonMonths: 12, observedThrough: "2026-09-09", companyPoints: points, benchmarkPoints: benchmark });
assert.equal(pending.status, "pending");
assert.equal(pending.companyReturnPct, null);
console.log("AI transition market-outcome verification passed.");
