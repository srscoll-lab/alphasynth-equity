# Research Dossier workflows

`dossier-orchestrator-v1.json` is the inactive end-to-end official-evidence pilot. It validates
the public request and calls the private AlphaSynth evidence builder using environment-backed
credentials. Its production webhook URL is the value intended for `DOSSIER_WEBHOOK_URL` after
import, credential configuration, and pilot testing.

Required n8n environment variables:

- `ALPHASYNTH_INTERNAL_URL`: network-reachable AlphaSynth service origin
- `DOSSIER_INTERNAL_TOKEN`: shared secret also configured on AlphaSynth

The orchestrator remains inactive in source control. Activate it only after a dated-official-source
test succeeds, then configure its production webhook as the application's `DOSSIER_WEBHOOK_URL`.
The public application route resolves official domains from the reviewed registry in
`src/dossier-companies.ts`; it does not trust caller-supplied domains. Add and validate a company
there before enabling dossier generation for it in the application.

## Pilot diagnostics and response handling

On n8n installations that block `$env`, configure the HTTP node with a literal candidate URL
and an encrypted **Header Auth** credential named `x-dossier-token`. Do not paste the token into
the workflow JSON or enable global environment access just for this workflow.

The HTTP node must use `specifyBody: "json"` and `jsonBody: "={{ $json }}"`. `specifyBody` is a
mode selector, not the request body. Response options include the full status/body and allow
non-2xx responses through to **Return Dossier**, which forwards the backend status and body.
Transport failures return a generic 502. A green n8n execution means the response was delivered;
it does not make a backend 422 into a successful dossier.

To repair an existing inactive pilot, export it first, retain the original, and run
`node scripts/patch-dossier-workflow.mjs backup.json corrected.json` before importing the
corrected file. This preserves the live URL, encrypted credential references and request body.

The evidence collector follows a bounded number of official PDF links from investor-relations
indexes, including icon-only links omitted by markdown conversion. It accepts exact dates from
publication metadata, dated exchange cover letters, exact unambiguous document-title-page dates,
PDF filenames, and structured or explicitly labelled dates tied to the document on its official index. Common same-origin PDF viewer/download
wrappers are normalized; cross-origin wrapper targets, upload folders, and fiscal-period labels
are never treated as publication evidence.
PDF extraction uses fast text parsing and is capped at 20 pages per attempted document by default
to prevent a large annual report from exhausting provider credits. Set `DOSSIER_PDF_MAX_PAGES`
between 5 and 30 only when a different bounded tradeoff is required.
Undated, unofficial and post-cutoff sources remain rejected. A 422 includes per-URL diagnostics.
If a broad search returns only undated landing pages, the backend makes one bounded PDF-focused
fallback search for the cutoff year; all normal domain, exact-date and cutoff checks still apply.

Regression tests: `node --import tsx scripts/verify-dossier-evidence.ts` and
`node --import tsx scripts/verify-dossier-contract.ts`.
The explicitly invoked `check-radico-evidence.ts` and `test-dossier-pilot.ts` scripts make live
pilot requests and may consume provider credits; the latter supports `--webhook` after clicking
the full workflow's **Execute workflow** button. Do not publish to run a manual webhook test.

Cross-company candidate validation is run sequentially with
`node --import tsx scripts/test-dossier-universe.ts --cutoff=YYYY-MM-DD`. The manifest in
`scripts/dossier-pilot-companies.json` deliberately covers different issuer-site patterns.
Use `--limit=N` for a low-credit smoke test or `--ticker=SYMBOL` for one company. Full responses
are written under `/tmp/dossier-universe-YYYYMMDD`; terminal output remains a compact summary.
Use `--list` to inspect the selected companies without calling the service or consuming credits.

`alphasynth-dossier-intake-v1.json` is the inactive, importable entry workflow for the pilot.
It validates the application request and creates separate official-evidence and social-discovery
plans. It deliberately does not replace or activate the live BMS workflows.

The downstream workflows named in its output must be implemented and tested before production use.
This intake webhook returns a discovery plan, not a completed dossier, and therefore must **not**
be configured as `DOSSIER_WEBHOOK_URL`. That variable must point to a future orchestration workflow
that runs discovery, reading, admission, classification, aggregation, and assembly and returns the
canonical `ResearchDossier` payload.

`official-source-admission-v1.json` is the deterministic trust gate for discovered URLs. It
requires verified company domains, rejects undated and post-cutoff material, blocks lookalike
domains, removes duplicates, and ranks regulator/exchange sources ahead of company sources.

`market-conversation-aggregation-v1.json` accepts classified public opinions, rejects malformed
or duplicate records, discounts possible sarcasm, and computes sentiment and themes without an
AI-written narrative. Fewer than five items or fewer than two sources produces
`insufficient_data`. Its output is structurally prohibited from affecting BMS.

`dossier-assembly-qc-v1.json` produces the canonical camel-case application payload. It checks
source-reference integrity, downgrades unsupported claims to `insufficient_evidence`, counts
conflicts, identifies thin evidence, and keeps human review enabled for the pilot.

`market-conversation-intake-v1.json` is the pilot's public-source and privacy boundary. Version 1
admits only public ValuePickr and Substack URLs, enforces the evidence cutoff, strips author
handles, limits retained text, and rejects private/login URLs before classification.

The application route `POST /api/dossier/classify-opinions` performs constrained classification
for admitted items. It requires `x-dossier-token` matching `DOSSIER_INTERNAL_TOKEN`, accepts no
author identity, caps batches at 50 records, and returns labels rather than narrative. n8n must
send the token as a credential-backed header; it must never be stored in a workflow export.

`market-conversation-classifier-connector-v1.json` performs that private call and validates both
the sanitized input and structured classifier response. It reads the application URL and token
from n8n environment variables and contains no secret value.
