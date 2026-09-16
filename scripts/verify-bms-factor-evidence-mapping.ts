import assert from "node:assert/strict";
import { mapBmsFactorMetric } from "../src/bms-factor-evidence.ts";

assert.deepEqual(mapBmsFactorMetric("Assets Under Management (Consolidated)"), { metric: "assets_under_management", factor: "execution" });
assert.deepEqual(mapBmsFactorMetric("Number of New Loans Booked (Q4)"), { metric: "new_loans_booked", factor: "execution" });
assert.deepEqual(mapBmsFactorMetric("Gross Non-Performing Assets"), { metric: "gnpa", factor: "balance_sheet" });
assert.deepEqual(mapBmsFactorMetric("Net Non-Performing Assets"), { metric: "nnpa", factor: "balance_sheet" });
assert.deepEqual(mapBmsFactorMetric("Provisioning Coverage Ratio"), { metric: "provision_coverage", factor: "balance_sheet" });
assert.equal(mapBmsFactorMetric("Revenue"), null);
console.log("PASS: descriptive factor metrics canonicalize without admitting earnings as execution");
