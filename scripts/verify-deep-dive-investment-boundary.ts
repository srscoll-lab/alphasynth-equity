import assert from "node:assert/strict";
import {
  enforceDeepDiveInvestmentBoundary,
  NO_TRACEABLE_ANALYST_VIEW,
} from "../src/deep-dive-investment-boundary.ts";

const unsupported = enforceDeepDiveInvestmentBoundary(`
## ANALYST TARGETS
Consensus Target Price: ₹3,500
Tactical Entry Zone: ₹3,000
Strategic Stop Loss: ₹2,850

Valuation Intelligence: 7
`);

assert.match(unsupported, /## EXTERNAL ANALYST VIEWS/);
assert.ok(unsupported.includes(NO_TRACEABLE_ANALYST_VIEW));
assert.doesNotMatch(unsupported, /3,500|3,000|2,850|entry zone|stop loss/i);

const undated = enforceDeepDiveInvestmentBoundary(`
## EXTERNAL ANALYST VIEWS
Example Securities rates the company Hold with a ₹3,400 target: https://example.com/undated
`);
assert.ok(undated.includes(NO_TRACEABLE_ANALYST_VIEW));
assert.doesNotMatch(undated, /₹3,400/);

const supported = enforceDeepDiveInvestmentBoundary(`
## EXTERNAL ANALYST VIEWS
| Firm | Date | View | Target | Source |
| --- | --- | --- | --- | --- |
| Example Securities | 2026-09-01 | Hold | ₹3,400 | https://example.com/report |

## RESEARCH CONCLUSION
Evidence remains mixed.
`);

assert.match(supported, /Example Securities/);
assert.match(supported, /\| Firm \| Date \| View \| Target \| Source \|/);
assert.match(supported, /https:\/\/example\.com\/report/);
assert.match(supported, /Evidence remains mixed/);

console.log("Deep Dive investment-boundary validation passed.");
