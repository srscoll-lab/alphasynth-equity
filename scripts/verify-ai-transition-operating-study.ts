import fs from "node:fs";
import assert from "node:assert/strict";

const input = JSON.parse(fs.readFileSync(new URL("./ai-transition-operating-delivery.json", import.meta.url), "utf8"));
assert.equal(input.companies.length, 10);
assert.equal(new Set(input.companies.map((company: any) => company.symbol)).size, 10);
for (const company of input.companies) {
  for (const key of ["exposureScore", "readinessScore", "revenueGrowthPct", "marginChangePp"]) {
    assert.equal(typeof company[key], "number", `${company.symbol}: ${key} must be numeric`);
    assert.ok(Number.isFinite(company[key]), `${company.symbol}: ${key} must be finite`);
  }
  for (const key of ["fy25Source", "fy26Source"]) assert.match(company[key], /^https:\/\//, `${company.symbol}: invalid ${key}`);
}

const results = JSON.parse(fs.readFileSync(new URL("../output/ai-transition/ten-company-operating-delivery-results.json", import.meta.url), "utf8"));
assert.equal(results.rows.length, 10);
for (const value of Object.values(results.correlations) as number[]) assert.ok(value >= -1 && value <= 1);
for (const value of Object.values(results.pValues) as number[]) assert.ok(value >= 0 && value <= 1);
console.log("AI transition operating-delivery study verification passed.");
