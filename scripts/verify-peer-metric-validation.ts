import assert from "node:assert/strict";
import { MAX_COMPARABLE_DEBT_EQUITY, sanitizeDebtEquity } from "../src/peer-metric-validation.ts";

assert.equal(sanitizeDebtEquity(0), 0);
assert.equal(sanitizeDebtEquity(0.42), 0.42);
assert.equal(sanitizeDebtEquity("1.75"), 1.75);
assert.equal(sanitizeDebtEquity("12,345.67"), null);
assert.equal(sanitizeDebtEquity(151510.01), null);
assert.equal(sanitizeDebtEquity(-0.1), null);
assert.equal(sanitizeDebtEquity(Number.NaN), null);
assert.equal(sanitizeDebtEquity(null), null);
assert.equal(sanitizeDebtEquity(MAX_COMPARABLE_DEBT_EQUITY), MAX_COMPARABLE_DEBT_EQUITY);
assert.equal(sanitizeDebtEquity(MAX_COMPARABLE_DEBT_EQUITY + 0.01), null);

console.log("Peer metric validation passed: implausible debt/equity values are withheld as N/A.");
