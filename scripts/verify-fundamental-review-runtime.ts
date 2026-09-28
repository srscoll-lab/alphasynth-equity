import assert from "node:assert/strict";
import { FundamentalReviewService } from "../src/fundamental-review-service.ts";
import { CloudTasksFundamentalReviewQueue, InMemoryFundamentalReviewQueue } from "../src/fundamental-review-queue.ts";
import { FirestoreFundamentalReviewStore, InMemoryFundamentalReviewStore } from "../src/fundamental-review-store.ts";

const fourFactorCandidates = ["earnings", "economics", "execution", "balance_sheet"]
  .map((factor) => ({ candidate_id: `candidate-${factor}`, factor_id: factor }));
const fourFactorValidations = fourFactorCandidates
  .map((candidate) => ({ candidate_id: candidate.candidate_id, status: "qualified" }));

const fetchMock: typeof fetch = async (input) => {
  const url = String(input);
  if (url.endsWith("/evidence")) {
    return new Response(JSON.stringify({
      candidates: fourFactorCandidates,
      documents: [{ document_id: "document-1" }],
      validations: fourFactorValidations,
      diagnostics: [],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (url.endsWith("/score")) {
    return new Response(JSON.stringify({
      fcs_score: 71.25,
      score_publishable: true,
      lifecycle_ready: false,
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error(`Unexpected URL ${url}`);
};

const store = new InMemoryFundamentalReviewStore();
const queue = new InMemoryFundamentalReviewQueue();
const service = new FundamentalReviewService({
  store,
  queue,
  evidenceUrl: "https://worker.test/evidence",
  scoringUrl: "https://worker.test/score",
  fetch: fetchMock,
  now: () => new Date("2026-09-28T08:00:00.000Z"),
});

const requested = await service.request({
  symbol: "LT",
  companyName: "Larsen & Toubro",
  informationCutoff: "2026-09-28",
});
assert.equal(requested.status, "queued");
assert.equal(queue.tasks.length, 1);

const duplicate = await service.request({
  symbol: "LT",
  companyName: "Larsen & Toubro",
  informationCutoff: "2026-09-28",
});
assert.equal(duplicate.jobId, requested.jobId);
assert.equal(queue.tasks.length, 1, "an in-progress request must not enqueue twice");

const completed = await service.execute(queue.tasks[0]);
assert.equal(completed.status, "score_ready_lifecycle_pending");
assert.equal(completed.completedFactors, 4);
assert.equal(completed.resultAvailable, true);
assert.equal(completed.scoreResult?.fcs_score, 71.25);

const incompleteStore = new InMemoryFundamentalReviewStore();
const incompleteQueue = new InMemoryFundamentalReviewQueue();
const incompleteService = new FundamentalReviewService({
  store: incompleteStore,
  queue: incompleteQueue,
  evidenceUrl: "https://worker.test/incomplete-evidence",
  scoringUrl: "https://worker.test/score",
  fetch: async (input) => {
    if (String(input).endsWith("/incomplete-evidence")) {
      return new Response(JSON.stringify({
        candidates: fourFactorCandidates.slice(0, 2),
        documents: [{ document_id: "document-1" }],
        validations: fourFactorValidations.slice(0, 2),
        diagnostics: [],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("Scoring must not run with incomplete factor coverage.");
  },
});
const incompleteRequest = await incompleteService.request({
  symbol: "INFY",
  companyName: "Infosys",
  informationCutoff: "2026-09-28",
});
const incomplete = await incompleteService.execute({ jobId: incompleteRequest.jobId!, symbol: "INFY" });
assert.equal(incomplete.status, "incomplete");
assert.equal(incomplete.completedFactors, 2);
assert.equal(incomplete.resultAvailable, false);
assert.equal(incomplete.failureCode, "INSUFFICIENT_VALIDATED_FACTORS");

let firestoreCommit: Record<string, any> | null = null;
const firestoreStore = new FirestoreFundamentalReviewStore({
  projectId: "test-project",
  tokenProvider: async () => "test-token",
  fetch: async (input, init) => {
    const url = String(input);
    if (url.endsWith("documents:commit")) {
      firestoreCommit = JSON.parse(String(init?.body || "{}"));
      return new Response(JSON.stringify({ writeResults: [{}, {}] }), { status: 200 });
    }
    return new Response("", { status: 404 });
  },
});
await firestoreStore.save(completed);
assert.equal(firestoreCommit?.writes?.length, 2, "job and latest-by-symbol records must commit together");
assert.match(firestoreCommit?.writes?.[0]?.update?.name || "", /fundamental_review_jobs_v1/);

let queuedTask: Record<string, any> | null = null;
const cloudQueue = new CloudTasksFundamentalReviewQueue({
  projectId: "test-project",
  location: "us-central1",
  queue: "fcs-reviews",
  workerUrl: "https://worker.test/internal/fundamental-review/execute",
  serviceAccountEmail: "tasks@test-project.iam.gserviceaccount.com",
  internalToken: "internal-test-token",
  tokenProvider: async () => "test-token",
  fetch: async (_input, init) => {
    queuedTask = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({ name: "task-1" }), { status: 200 });
  },
});
await cloudQueue.enqueue({ jobId: "job-1", symbol: "LT" });
assert.equal(queuedTask?.task?.dispatchDeadline, "900s");
assert.equal(queuedTask?.task?.httpRequest?.oidcToken?.serviceAccountEmail, "tasks@test-project.iam.gserviceaccount.com");
assert.equal(queuedTask?.task?.httpRequest?.headers?.["x-fundamental-review-token"], "internal-test-token");

console.log("Durable Fundamental Review runtime verified.");
