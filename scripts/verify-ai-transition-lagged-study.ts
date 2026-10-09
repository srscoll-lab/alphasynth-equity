import assert from "node:assert/strict";
import fs from "node:fs";

const input = JSON.parse(fs.readFileSync(new URL("./ai-transition-fy25-lagged-validation.json", import.meta.url), "utf8"));
assert.equal(input.companies.length, 10);
assert.equal(new Set(input.companies.map((company: any) => company.symbol)).size, 10);
assert.ok(input.companies.every((company: any) => company.assessmentAsOf <= input.scoreCutoff));
assert.ok(input.scoreCutoff <= input.returnStart);
assert.ok(input.companies.every((company: any) => company.startClose > 0 && company.endClose > 0));
assert.ok(input.companies.every((company: any) => new URL(company.officialSource).protocol === "https:"));

for (const side of ["exposure", "readiness"] as const) {
  const weights = input.methodology[`${side}Weights`];
  const weightTotal = (Object.values(weights) as number[]).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(weightTotal - 1) < 1e-9);
  for (const company of input.companies) {
    for (const value of Object.values(company[side])) {
      assert.ok(value === null || (typeof value === "number" && value >= 0 && value <= 100));
    }
  }
}

const results = JSON.parse(fs.readFileSync(new URL("../output/ai-transition/ten-company-lagged-study-results.json", import.meta.url), "utf8"));
assert.equal(results.rows.length, 10);
assert.ok(Object.values(results.pValues).every((value: any) => value >= 0 && value <= 1));
assert.ok(results.rows.every((row: any) => row.exposureCoveragePct >= 60 && row.readinessCoveragePct >= 60));
console.log("AI transition lagged 10-company study verification passed.");
