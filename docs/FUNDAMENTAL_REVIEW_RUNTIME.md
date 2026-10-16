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
| `FUNDAMENTAL_REVIEW_SUPPORTED_SYMBOLS` | Comma-separated, server-enforced controlled-beta allowlist. The current evidence gate is `BAJFINANCE,HINDALCO,INFY,LT,SUNPHARMA`. |
| `FUNDAMENTAL_REVIEW_WORKER_IAM_AUTH` | When `true`, the public gateway authenticates to the private Cloud Run worker with the service's Google identity token. |

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
| `TAPETIDE_TOKEN` | Personal Tapetide token injected from Secret Manager. When present, the evidence service uses the supported MCP endpoint to discover filing links for any scanned Radar company. It never makes provider values publishable by themselves. |
| `TAPETIDE_MCP_URL` | Optional override; defaults to `https://mcp.tapetide.com/mcp`. |

The protected `POST /internal/fundamental-review/provider-candidates` gateway
calls Tapetide `get_financials` and returns bounded same-quarter candidate
comparisons. They are explicitly non-publishable. The inactive n8n workflow
`n8n/fcs-evidence-orchestrator-v1.json` attaches those hints to the official
document research request; Gemini may use them to locate the relevant table but
must find the same value, period, unit and basis in an admitted original. Only the
existing deterministic canonicalizer, validator and scorer can publish an FCS.

## Tapetide-assisted admission

When `TAPETIDE_TOKEN` is configured, every company in the scanned Momentum Radar universe may start an FCS review. The interface labels this **FCS review available**, not **evidence preflight passed**. The distinction is deliberate:

1. Tapetide supplies structured discovery and filing-link candidates through its MCP service.
2. Only links resolving to NSE, BSE or an independently trusted issuer domain are admitted.
3. The existing worker downloads and archives the original document.
4. The deterministic V2 validator still requires four comparable, source-qualified factors before scoring.
5. An unsuccessful evidence search ends as `incomplete`; it never produces an estimated FCS.

The provider token must not be exposed to the browser or committed to this repository.

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

## Provider-assisted orchestration beta (2026-10-14)

The private worker now sends dynamic evidence requests to the active n8n webhook
`alphasynth-fcs-evidence-v1`. The workflow first obtains bounded Tapetide
financial candidates, then asks the application evidence route to locate and
verify the same periods, values, units and accounting basis in admitted issuer
or exchange originals. Tapetide values remain non-publishable navigation hints.

Controlled acceptance produced both required outcomes:

- HCL Technologies: four structured evidence rows, one for each FCS factor;
  diagnostic outcome `four_factor_official_quarter_pair`.
- Marine Electricals: zero admitted rows after the official-source checks;
  processing remains incomplete and no FCS is created.

The isolated application revision is `alphasynth-equity-fcsorchd1014`; normal
application traffic remains on the pre-existing production revision. The worker
revision `fcs-review-worker-fcsorch1014` serves worker traffic and points its
dynamic-evidence URL to n8n. This verifies the orchestration and its fail-closed
boundary; it does not imply that every requested company can be completed.

## Current activation boundary

The authoritative scorer now lives in `alphasynth-bms-v2/scripts/serve-fcs-review.mjs` and directly reuses the approved deterministic V2 modules. It returns at minimum:

```json
{
  "fcs_score": 71.25,
  "score_publishable": true,
  "lifecycle_ready": false
}
```

The authoritative scorer and durable worker are deployed. New evidence still
passes through the complete V2 document, candidate and validation contracts;
the older factor-evidence CSV response must not be adapted into a publishable
score by assumption. Public availability should describe this as an evidence
review request, not a guaranteed report: four verified factors publish an FCS,
while an insufficient original-source record ends as `incomplete`.

Even after activation, the gateway fails closed unless `FUNDAMENTAL_REVIEW_SUPPORTED_SYMBOLS` contains at least one symbol. Both the API and frontend enforce this controlled-beta scope; unsupported companies remain searchable and existing reports remain viewable, but no new job can be started for them.

## Capped stage-one deployment (2026-09-30)

The infrastructure-only smoke gate is deployed in `my-nse-research-app`, region `us-central1`:

- private Cloud Run service: `fcs-review-worker`
- runtime identity: `fcs-worker@my-nse-research-app.iam.gserviceaccount.com`
- Cloud Tasks OIDC identity: `fcs-tasks@my-nse-research-app.iam.gserviceaccount.com`
- Firestore database: `(default)`; collection: `fundamental_review_jobs_v1`
- Cloud Tasks queue: `fcs-reviews`; one concurrent dispatch; currently `PAUSED`
- Secret Manager secret: `fcs-internal-token`

The synthetic `INFRA-SMOKE` request passed the capped gate: Cloud Run rejected anonymous access, the authenticated request returned HTTP 202, Firestore returned the durable queued record, and Cloud Tasks contained the matching execute task. The task was not dispatched because the queue remained paused.

This historical stage-one note is retained for the deployment record. Its
placeholder URLs have since been replaced; see **Provider-assisted orchestration
beta (2026-10-14)** above for the current state.
