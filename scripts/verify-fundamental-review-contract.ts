import assert from "node:assert/strict";
import {
  cleanFundamentalReviewSymbol,
  isFundamentalReviewInProgress,
  normalizeFundamentalReviewJob,
  publishedFundamentalReviewResult,
  publicFundamentalReviewJob,
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

const scoreReady = normalizeFundamentalReviewJob({ status: "score_ready_lifecycle_pending" }, { symbol: "INFY" });
assert.equal(scoreReady.resultAvailable, true);
assert.equal(isFundamentalReviewInProgress(scoreReady.status), false);

console.log("Fundamental Review request/status contract verified.");
const legacyHindalco={symbol:'HINDALCO',status:'ready',completedFactors:4,resultAvailable:true,scoreResult:{score_publishable:true,fcs_score:59,factors:[{factor_id:'economics',impacts:[{metric_id:'ebitda'}]}]}};
assert.equal(publishedFundamentalReviewResult(legacyHindalco),null);
assert.equal(publicFundamentalReviewJob(legacyHindalco,{symbol:'HINDALCO'}).resultAvailable,false);
assert.ok(publicFundamentalReviewJob(legacyHindalco,{symbol:'HINDALCO'}).message.includes('reconciliation'));
assert.equal(normalizeFundamentalReviewJob({status:'ready',resultAvailable:false},{symbol:'HINDALCO'}).resultAvailable,false);
assert.equal(publishedFundamentalReviewResult({...legacyHindalco,scoreResult:{score_publishable:true,fcs_score:41,factors:[{factor_id:'economics',impacts:[{metric_id:'ebitda_margin'}]}]}})?.fcs_score,41);
console.log('Legacy Hindalco policy mismatch is not re-published; explicit unavailable status is preserved without ledger mutation.');
