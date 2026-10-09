import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessLifecycle, checkpointFromScore, mergeCheckpoint, previousQuarterEnd, type FcsCheckpoint } from "../src/fundamental-review-history.ts";
import { FundamentalReviewService } from "../src/fundamental-review-service.ts";
import { InMemoryFundamentalReviewStore, FirestoreFundamentalReviewStore } from "../src/fundamental-review-store.ts";
import { InMemoryFundamentalReviewQueue } from "../src/fundamental-review-queue.ts";
import { publishedFundamentalReviewResult } from "../src/fundamental-review-contract.ts";

const ids = ["earnings", "economics", "execution", "balance_sheet"];
function mockScore(end: string, raw = 0.5, symbol = "LT") {
  return { symbol, fcs_score: 65, raw_score: raw, score_publishable: true, methodology_id: "unit-test-method", impact_policy_id: "unit-test-policy", factors: ids.map((id) => ({
    factor_id: id, impacts: [{ metric_id: id, comparison_basis: "same_quarter_prior_year",
      consolidation_basis: "consolidated", canonical_unit: "INR crore", previous_value: 100, current_value: 110,
      previous_document_id: "test-previous-doc", current_document_id: "test-current-doc",
      current_period: { label: "Q1 test", end_date: end, duration_months: 3 },
      previous_period: { end_date: end.replace("2026", "2025") } }],
  })) };
}
function checkpoint(end: string, raw = 0.5, symbol = "LT") {
  const result = checkpointFromScore({ symbol, score: mockScore(end, raw, symbol), informationCutoff: end > "2026-08-25" ? end : "2026-08-25",
    calculatedAt: "2026-10-06T00:00:00Z", sourceJobId: "unit-test-only" });
  assert(result); return result;
}
assert.equal(previousQuarterEnd("2026-06-30"), "2026-03-31");
assert.equal(previousQuarterEnd("2026-03-31"), "2025-12-31");
let history = [checkpoint("2025-12-31"), checkpoint("2026-03-31"), checkpoint("2026-06-30")];
assert.equal(assessLifecycle(history, "2026-08-25", "2026-10-06")?.classification, "ESTABLISHED");
assert.equal(mergeCheckpoint(history, checkpoint("2026-06-30", -1)).length, 3);
assert.equal(mergeCheckpoint(history, checkpoint("2026-06-30", -1))[2].rawScore, 0.5, "published checkpoint must not be overwritten");
assert.equal(assessLifecycle(history.slice(1), "2026-08-25", "2026-10-06"), null);
assert.equal(assessLifecycle(history, "2026-06-01", "2026-10-06"), null, "post-cutoff history must be excluded");
assert.equal(assessLifecycle([history[0], { ...history[1], comparabilityKey: "different" }, history[2]], "2026-08-25", "now"), null);
assert.equal(assessLifecycle([history[0], checkpoint("2026-06-30"), checkpoint("2026-09-30")], "2026-12-01", "now"), null, "missing quarter must not be bridged");
const annual = mockScore("2026-03-31"); annual.factors[0].impacts[0].comparison_basis = "annual_prior_year";
assert.equal(checkpointFromScore({ symbol: "LT", score: annual, informationCutoff: "2026-08-25", calculatedAt: "now", sourceJobId: "test" }), null);
const mixed = mockScore("2026-06-30"); mixed.factors[0].impacts[0].current_period.end_date = "2026-03-31";
assert.equal(checkpointFromScore({ symbol: "LT", score: mixed, informationCutoff: "2026-08-25", calculatedAt: "now", sourceJobId: "test" }), null);
const indAs = mockScore("2026-06-30");
indAs.factors.forEach((factor) => { factor.impacts[0].consolidation_basis = "consolidated_ind_as"; });
const indAsCheckpoint = checkpointFromScore({ symbol: "LT", score: indAs, informationCutoff: "2026-08-25", calculatedAt: "now", sourceJobId: "test" });
assert(indAsCheckpoint, "explicit legacy Ind AS basis must be reusable without relabelling");
assert.notEqual(indAsCheckpoint.comparabilityKey, history[2].comparabilityKey, "different accounting scopes must remain distinct");
indAs.factors[0].impacts[0].consolidation_basis = "unknown";
assert.equal(checkpointFromScore({ symbol: "LT", score: indAs, informationCutoff: "2026-08-25", calculatedAt: "now", sourceJobId: "test" }), null);

// Two real company score-triplet REPLAYS, not new evidence or coverage promotion.
const approval = JSON.parse(readFileSync("../alphasynth-bms-v2/config/five-company-v2-release-approval-v1.json", "utf8"));
const { classifyTrajectoryLifecycle } = await import("../../alphasynth-bms-v2/src/trajectory-lifecycle-v2-1.mjs");
const { scoreFundamentalChangeReview } = await import("../../alphasynth-bms-v2/src/fcs-review-scorer.mjs");
const bundle = JSON.parse(readFileSync("data/fundamental-review-approved-five-company-v2.json", "utf8"));
const replays = [];
for (const symbol of ["INFY", "LT"]) {
  const recorded = approval.approved_results.find((item: any) => item.symbol === symbol);
  const actualScore = scoreFundamentalChangeReview({ symbol, candidates: bundle.candidates,
    documents: bundle.documents, validations: bundle.validations });
  assert.equal(actualScore.score_publishable, true);
  assert.equal(actualScore.raw_score, recorded.q3_raw_score, `${symbol}: canonical score must match recorded approval`);
  const actualCheckpoint = checkpointFromScore({ symbol, score: actualScore, documents: bundle.documents,
    informationCutoff: "2026-08-25", calculatedAt: "2026-10-06", sourceJobId: "local-source-replay-not-published" });
  assert(actualCheckpoint, `${symbol}: actual canonical impacts must pass quarter admission`);
  assert(actualCheckpoint.documentReferences.length > 0);
  const triple = ["2025-06-30", "2025-09-30", "2025-12-31"].map((date, i) => checkpoint(date, [recorded.q1_raw_score, recorded.q2_raw_score, recorded.q3_raw_score][i], symbol));
  const expected = classifyTrajectoryLifecycle({ current: recorded.q3_raw_score, previous: recorded.q2_raw_score,
    earlier: recorded.q1_raw_score, currentCompleteFactors: 4 });
  const result = assessLifecycle(triple, "2026-08-25", "2026-10-06")!;
  assert.equal(result.classification, expected.lifecycle);
  replays.push({ symbol, lifecycle: result.classification, canonical_latest_raw: actualScore.raw_score,
    canonical_latest_fcs: actualScore.fcs_score, periods: triple.map((item) => item.periodEnd) });
}
const hindalcoRecorded = approval.approved_results.find((item: any) => item.symbol === "HINDALCO");
const hindalcoCanonical = scoreFundamentalChangeReview({ symbol: "HINDALCO", candidates: bundle.candidates,
  documents: bundle.documents, validations: bundle.validations });
const sourceParityIssues = hindalcoCanonical.raw_score !== hindalcoRecorded.q3_raw_score
  ? [{ symbol: "HINDALCO", old_approved_raw: hindalcoRecorded.q3_raw_score, canonical_replay_raw: hindalcoCanonical.raw_score,
    action: "reconcile definitions and evidence before importing legacy history; no values changed" }] : [];
// Threshold/precedence parity across a deterministic grid, including boundaries.
for (const current of [-0.5, 0.18, 0.38, 0.8]) for (const previous of [-0.5, 0.18, 0.38, 0.8]) for (const earlier of [-0.5, 0.18, 0.38, 0.8]) {
  const actual = assessLifecycle([checkpoint("2025-12-31", earlier), checkpoint("2026-03-31", previous), checkpoint("2026-06-30", current)], "2026-08-25", "now")!;
  assert.equal(actual.classification, classifyTrajectoryLifecycle({ current, previous, earlier, currentCompleteFactors: 4 }).lifecycle);
}

const store = new InMemoryFundamentalReviewStore(); const queue = new InMemoryFundamentalReviewQueue();
let evidenceCalls = 0, scoreCalls = 0, latestEnd = "2026-06-30", breakHistory = false;
const service = new FundamentalReviewService({ store, queue, historicalBackfillEnabled: true,
  evidenceUrl: "https://test/evidence", scoringUrl: "https://test/score", now: () => new Date("2026-10-06T08:00:00Z"),
  fetch: async (input, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(input).endsWith("/evidence")) {
      evidenceCalls++;
      if (body.target_period_end && breakHistory) return new Response("{}", { status: 503 });
      const end = body.target_period_end || latestEnd;
      const candidates = ids.map((id) => ({ candidate_id: id, factor_id: id, current_period: { end_date: end } }));
      return Response.json({ candidates, documents: [], validations: candidates.map((item) => ({ candidate_id: item.candidate_id, status: "qualified" })) });
    }
    scoreCalls++;
    return Response.json(mockScore(body.candidates[0].current_period.end_date));
  },
});
const first = await service.request({ symbol: "LT", companyName: "Larsen & Toubro", informationCutoff: "2026-08-25" });
const completed = await service.execute({ jobId: first.jobId!, symbol: "LT" });
assert.equal(completed.status, "ready"); assert.equal(completed.checkpointHistory?.length, 3);
assert.equal(evidenceCalls, 3); assert.equal(scoreCalls, 3);
assert.equal(publishedFundamentalReviewResult(completed)?.lifecycle_ready, true);
const next = await service.request({ symbol: "LT", companyName: "Larsen & Toubro", informationCutoff: "2026-08-26" });
await service.execute({ jobId: next.jobId!, symbol: "LT" });
assert.equal(evidenceCalls, 4, "unchanged quarterly history must be reused without historical model calls");
latestEnd = "2026-09-30"; breakHistory = true;
const update = await service.request({ symbol: "LT", companyName: "Larsen & Toubro", informationCutoff: "2026-10-06" });
const updated = await service.execute({ jobId: update.jobId!, symbol: "LT" });
assert.equal(updated.status, "ready", "the two preceding quarters are already cached");
assert.equal(updated.lastCompletedLifecycle?.latestPeriodEnd, "2026-09-30");
// New period after a gap cannot wipe out the last completed assessment.
latestEnd = "2027-06-30";
const gap = await service.request({ symbol: "LT", companyName: "Larsen & Toubro", informationCutoff: "2027-08-25" });
const incomplete = await service.execute({ jobId: gap.jobId!, symbol: "LT" });
assert.equal(incomplete.status, "score_ready_lifecycle_pending");
assert.equal(incomplete.resultAvailable, true);
assert.equal(incomplete.lastCompletedLifecycle?.latestPeriodEnd, "2026-09-30");
assert.equal(publishedFundamentalReviewResult(incomplete)?.lifecycle_ready, false);
assert.match(incomplete.message, /last completed lifecycle/);
await assert.rejects(() => service.request({ symbol: "LT", companyName: "LT", informationCutoff: "2026-08-25" }), /backwards/);

let saved: any;
const firestore = new FirestoreFundamentalReviewStore({ projectId: "test", tokenProvider: async () => "test",
  fetch: async (input, init) => {
    if (String(input).endsWith(":commit")) { saved = JSON.parse(String(init?.body)).writes[0].update; return Response.json({}); }
    return Response.json(saved);
  },
});
await firestore.save(incomplete);
const restored = await firestore.readLatest("LT");
assert.deepEqual(restored?.checkpointHistory, incomplete.checkpointHistory);
assert.deepEqual(restored?.lastCompletedLifecycle, incomplete.lastCompletedLifecycle);
console.log(JSON.stringify({ status: "passed", real_company_score_replays: replays, new_companies_published: 0,
  legacy_source_parity_issues: sourceParityIssues,
  model_calls_in_this_regression_test: 0, tests: "quarter gates, source identity, comparability, cutoff, retention, caching, worker orchestration, Firestore persistence, V2.1 parity" }, null, 2));
