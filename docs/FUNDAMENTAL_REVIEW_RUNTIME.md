# Fundamental Change Review runtime

## Purpose

This runtime turns an explicit user request into a durable, auditable FCS job. It does not infer that a company is FCS-eligible from its Momentum Radar state, and opening a Deep Dive does not start an FCS job.

The public interface remains disabled until both the request and status gateways are configured. A request is acknowledged only after its job record has been written to Firestore and Cloud Tasks has accepted the task.

## Runtime sequence

1. The user confirms **Request FCS Review**.
2. The AlphaSynth gateway calls the private worker request endpoint.
3. The worker reuses an active or completed job for the same symbol, or creates a new job.
4. The job is written to both the immutable job collection and the latest-by-symbol collection in one Firestore commit.
5. Cloud Tasks invokes the worker execution endpoint with a 15-minute dispatch deadline and OIDC identity.
6. The worker calls the evidence service for canonical V2 candidates, immutable document records and independent validation records covering all four mandatory factors.
7. Fewer than four independently qualified factors produces `incomplete`; no score is estimated. Reduced legacy CSV rows are not accepted by the scorer.
8. Four qualified factors are submitted to the authoritative Node.js BMS/FCS scoring service, which directly imports the approved V2 validator and scoring modules rather than translating the formula into another language.
9. A score is exposed only when the scorer returns `score_publishable: true`.
10. The result becomes either `score_ready_lifecycle_pending` or `ready`, depending on whether three comparable checkpoints exist.

## Recommended deployment topology

- **AlphaSynth web service:** public frontend and `/api/bms/fundamental-review/*` gateway.
- **FCS worker Cloud Run service:** same container image initially, deployed as a private service with a 15-minute request timeout.
- **Cloud Tasks:** one queue with a conservative concurrency limit to control Vertex cost.
- **Firestore:** job status and compact result metadata.
- **Cloud Storage/evidence ledger:** source documents, hashes and detailed evidence artifacts. Firestore is not the document archive.
- **BMS API:** authoritative deterministic validator and scorer. The worker must not duplicate the formula.

## Required environment variables

### AlphaSynth public gateway

| Variable | Meaning |
|---|---|
| `FUNDAMENTAL_REVIEW_REQUEST_WEBHOOK_URL` | Private worker `/internal/fundamental-review/request` URL |
| `FUNDAMENTAL_REVIEW_STATUS_URL` | Private worker `/internal/fundamental-review/status` URL |
| `FUNDAMENTAL_REVIEW_INTERNAL_TOKEN` | Secret shared only between approved services |
| `FUNDAMENTAL_REVIEW_PUBLIC_REQUESTS_ENABLED` | Explicit release gate. Must equal `true` only after the live five-company integration gate passes. |

### Private worker

| Variable | Meaning |
|---|---|
| `FUNDAMENTAL_REVIEW_GCP_PROJECT` | Google Cloud project ID |
| `FUNDAMENTAL_REVIEW_FIRESTORE_DATABASE` | Firestore database; defaults to `(default)` |
| `FUNDAMENTAL_REVIEW_FIRESTORE_COLLECTION` | Job collection; defaults to `fundamental_review_jobs_v1` |
| `FUNDAMENTAL_REVIEW_TASKS_LOCATION` | Cloud Tasks region, normally `us-central1` |
| `FUNDAMENTAL_REVIEW_TASKS_QUEUE` | Queue name |
| `FUNDAMENTAL_REVIEW_TASKS_SERVICE_ACCOUNT` | OIDC service account used by Cloud Tasks |
| `FUNDAMENTAL_REVIEW_WORKER_URL` | Private worker `/internal/fundamental-review/execute` URL |
| `FUNDAMENTAL_REVIEW_WORKER_AUDIENCE` | Optional Cloud Run OIDC audience |
| `FUNDAMENTAL_REVIEW_EVIDENCE_URL` | Canonical V2 evidence endpoint returning `candidates`, `documents` and `validations` |
| `FUNDAMENTAL_REVIEW_SCORING_URL` | Authoritative V2 scoring service `/score` endpoint |
| `FUNDAMENTAL_REVIEW_INTERNAL_TOKEN` | Shared service secret |
| `DOSSIER_INTERNAL_TOKEN` | Token accepted by the evidence endpoint |

The worker reports itself as configured only when every mandatory runtime variable is present. Secrets must be injected from Secret Manager rather than committed to the repository.

## IAM requirements

- AlphaSynth runtime identity: `roles/run.invoker` on the private FCS worker.
- Cloud Tasks service agent/runtime identity: permission to create tasks.
- Cloud Tasks OIDC service account: `roles/run.invoker` on the worker.
- Worker runtime identity: Firestore document read/write, task enqueue and permission to invoke the evidence and scoring services.
- No browser receives a Google Cloud credential or internal service token.

## User-visible states

| State | Meaning |
|---|---|
| `No FCS report yet` | No FCS availability or publishability conclusion has been made. The enabled action is **Start FCS Review**. |
| `Review queued` | A durable job exists in Firestore and Cloud Tasks accepted it. |
| `Locating evidence` | The worker is gathering dated evidence. |
| `Validating factors` | Candidate evidence is being checked against the four-factor contract. |
| `Calculating FCS` | All four factors passed and the authoritative scorer is running. |
| `FCS ready · lifecycle pending` | A publishable current score exists but three comparable checkpoints do not. |
| `FCS & lifecycle ready` | Both outputs are available. |
| `Review incomplete` | Evidence was insufficient; no score was estimated. |
| `Review needs attention` | An operational failure occurred; no score was estimated. |

## Verification

Run:

```text
npm run verify:fundamental-review
npm run lint
npm run build
```

The runtime test proves request idempotency, queue dispatch, the four-factor stop line, and the separation between a ready FCS and a ready lifecycle. Live Firestore, Cloud Tasks, evidence and scoring integration must still pass the five-company gate before the public request button is enabled.

## Remaining activation gate

The authoritative scorer now lives in `alphasynth-bms-v2/scripts/serve-fcs-review.mjs` and directly reuses the approved deterministic V2 modules. It returns at minimum:

```json
{
  "fcs_score": 71.25,
  "score_publishable": true,
  "lifecycle_ready": false
}
```

The remaining backend dependency is a production evidence endpoint that emits the complete V2 evidence, document and validation contracts. The older factor-evidence CSV response lacks comparison basis, consolidation basis, period-end dates, raw/canonical units and immutable archive hashes, so it must not be adapted into a publishable score by assumption.

Until the canonical evidence endpoint, scorer deployment and five-company live gate all pass, keep `FUNDAMENTAL_REVIEW_PUBLIC_REQUESTS_ENABLED` unset (or `false`) and do not claim that automated FCS requests are available. Request/status URLs alone cannot enable the public button.

## Capped stage-one deployment (2026-09-30)

The infrastructure-only smoke gate is deployed in `my-nse-research-app`, region `us-central1`:

- private Cloud Run service: `fcs-review-worker`
- runtime identity: `fcs-worker@my-nse-research-app.iam.gserviceaccount.com`
- Cloud Tasks OIDC identity: `fcs-tasks@my-nse-research-app.iam.gserviceaccount.com`
- Firestore database: `(default)`; collection: `fundamental_review_jobs_v1`
- Cloud Tasks queue: `fcs-reviews`; one concurrent dispatch; currently `PAUSED`
- Secret Manager secret: `fcs-internal-token`

The synthetic `INFRA-SMOKE` request passed the capped gate: Cloud Run rejected anonymous access, the authenticated request returned HTTP 202, Firestore returned the durable queued record, and Cloud Tasks contained the matching execute task. The task was not dispatched because the queue remained paused.

This stage deliberately does **not** activate evidence retrieval, scoring, public request/status routing, or the frontend request button. The evidence and scoring URL values on the private worker are non-routable placeholders. The next stage must replace both placeholders, run the live five-company gate, and only then consider resuming the queue and enabling public requests.
