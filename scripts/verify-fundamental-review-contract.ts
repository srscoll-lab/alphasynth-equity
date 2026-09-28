import assert from "node:assert/strict";
import {
  cleanFundamentalReviewSymbol,
  isFundamentalReviewInProgress,
  normalizeFundamentalReviewJob,
} from "../src/fundamental-review-contract.ts";

assert.equal(cleanFundamentalReviewSymbol(" bajaj-auto "), "BAJAJ-AUTO");
assert.equal(cleanFundamentalReviewSymbol("../../etc"), "");

const queued = normalizeFundamentalReviewJob({
  job_id: "job-123",
  status: "queued",
  completed_factors: 9,
  requested_at: "2026-09-28T08:00:00Z",
}, { symbol: "LT", companyName: "Larsen & Toubro" });

assert.equal(queued.symbol, "LT");
assert.equal(queued.jobId, "job-123");
assert.equal(queued.completedFactors, 4);
assert.equal(queued.totalFactors, 4);
assert.equal(isFundamentalReviewInProgress(queued.status), true);

const unknown = normalizeFundamentalReviewJob({ status: "made_up" }, { symbol: "TCS" });
assert.equal(unknown.status, "not_started");
assert.equal(unknown.resultAvailable, false);

const ready = normalizeFundamentalReviewJob({ status: "ready" }, { symbol: "TCS" });
assert.equal(ready.resultAvailable, true);

console.log("Fundamental Review request/status contract verified.");
