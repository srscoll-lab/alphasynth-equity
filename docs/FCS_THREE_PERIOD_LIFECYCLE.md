# Three-period FCS lifecycle — capped implementation stage

Date: 6 October 2026. This is a current-review workflow, not a change to the frozen validation study.

## Scope and status

Implementation adds quarterly checkpoint retention to the durable FCS worker and a dated lifecycle view to My FCS reviews. The private scorer and worker have been deployed, with extra historical model retrieval disabled initially. No fresh evidence retrieval, new company promotion or bulk backfill has been performed in this stage.

The current FCS is scored by the existing authoritative scorer. The worker builds its history only from scorer-approved four-factor impacts. A model cannot declare that lifecycle is ready.

## Dates and comparable history

- Reporting-period end: the quarter described by the evidence.
- Information cutoff: the latest information permitted for that review. Historical reconstruction can use material available by this cutoff; it is not necessarily a contemporaneous historical signal.
- Calculated-at: when the assessment was computed.
- Forward-price observation dates are independent. The August 2026 validation cohort, scores, cutoffs and classifications are untouched.

The latest supported quarter and its two immediately preceding quarters must each have four complete factors. This stage supports March, June, September and December quarter ends. All approved impacts in a checkpoint must refer to that same end date. Annual/YTD flows and mixed-quarter records cannot qualify. Snapshot metrics may use point-in-time comparisons.

To prevent accidental comparison of differently defined scores, all three checkpoints must have the same factor/metric, comparison-basis, consolidation-basis and unit signature. A metric substitution requires explicit harmonisation; it is not silently accepted. This strict gate may leave some legacy assessments pending until their inputs are reconciled.

The classifier uses the existing V2.1 thresholds and precedence unchanged. A deterministic test grid compares this worker implementation against the original classifier in alphasynth-bms-v2.

## Retention and reuse

Checkpoint history and the last completed assessment are retained in the Firestore job/latest records, including document IDs, URLs, archive URIs, hashes, raw compared values and source locators where returned by the scorer/evidence service. Historical job records remain available. Repeated requests using the same quarter do not count as additional history.

A previously retained checkpoint is never silently overwritten. A changed score/source record for that quarter is a revision requiring explicit review. An incompatible cached quarter is marked for harmonisation rather than repeatedly retrieved at extra cost. A later request date permits a fresh current assessment; an earlier cutoff request is rejected rather than returning newer evidence as historical.

When a new quarter cannot complete a three-period sequence, the prior completed lifecycle remains dated. It must not be labelled as an up-to-date assessment. Current FCS remains available when historical retrieval alone fails.

Existing static library checkpoints are NOT automatically imported into Firestore. A verified migration is still needed before claiming that the existing 37 pending companies have been completed.

## Bounded historical retrieval

Cache reuse is built into every successful review. Extra live retrieval is opt-in via `FUNDAMENTAL_REVIEW_HISTORY_BACKFILL_ENABLED=true` on the worker.

When enabled, the worker attempts at most two missing quarters, sequentially, with a combined three-minute client-side historical-processing budget. It sends an explicit target period through the evidence gateway to grounded research and filters returned candidates to that target before authoritative scoring. No extra agents or retry loops are created.

Current evidence retrieval is limited to nine minutes and current scoring to one minute, leaving time within the existing 15-minute task deadline for history. These are processing bounds, not completion guarantees. A timed-out client does not guarantee cancellation of an upstream model invocation; separate Google billing can still occur. No monetary spend ceiling is claimed.

Frozen approved evidence can serve its original cutoff or an explicit historical quarter. It must not be presented as today's latest results merely because a new review was requested today.

## Verification and two-company replay

Run from the equity repository:

```powershell
node --experimental-strip-types scripts/verify-fcs-quarterly-history.ts
node --experimental-strip-types scripts/verify-fundamental-review-runtime.ts
node --experimental-strip-types scripts/verify-fundamental-review-activity.ts
```

The history test covers quarter adjacency, incomplete factors/metadata, mixed periods, accounting comparability, cutoff exclusion, immutability, reuse, historical failure, rolling updates, dated retention and Firestore round-trip persistence.

Two existing approved score triplets are replayed: INFY and LT, using quarter ends June, September and December 2025. INFY remains Fading; LT is Rebounding under the corrected existing V2.1 precedence. Their latest canonical evidence is also re-scored locally: INFY raw -0.2166 / FCS 45 and LT raw 1.0022 / FCS 75 match their recorded approved latest scores and pass quarterly checkpoint admission with actual document references. These are local replays, NOT fresh filing audits, freshly extracted evidence, or new publishable company results. Synthetic source metadata is used solely for history-orchestration unit-test fixtures; it is not imported into a live ledger.

### Hindalco reconciliation flag

An additional canonical source replay exposed an existing mismatch: before repair, the live scorer gave HINDALCO raw 0.3768 / FCS 59, while its approved summary records raw -0.351 / FCS 41. The cause was an omitted existing policy override: EBITDA must be an input to derived EBITDA margin, not a score-bearing absolute-growth metric. The live scorer now honours the already-approved override, deriving 13.89% and 12.84% from the validated revenue/EBITDA inputs and reproducing raw -0.351 / FCS 41. It keeps both input candidates and document locators in derivation provenance, and blocks incompatible periods, consolidation bases, units, missing provenance, post-cutoff inputs and zero denominators. Frozen approved figures and lifecycle thresholds are unchanged. Hindalco history is not bulk-promoted by this repair.

## Next release gate

1. Private deployments: `fcs-review-scorer-marginhistory1006` and `fcs-review-worker-history1006`.
2. Local history/display/persistence tests pass. Private cloud scorer health and worker capability checks pass.
3. The live two-company smoke test replays existing archived canonical inputs directly through the scorer: HINDALCO raw -0.351 / FCS 41 and LT raw 1.0022 / FCS 75. No research endpoint, job request/execute endpoint or Firestore write is invoked. Authentication is kept in memory and never printed.
4. Matching frontend deployed as `alphasynth-equity-fcshistory1006` to `expectation-pilot`. Final routing check confirms main traffic stays 100% on `alphasynth-equity-dossier17`; the beta capabilities endpoint is reachable and the worker reports extra historical retrieval disabled.
5. Re-check Codex allowance and agree a bounded live historical-evidence pilot before enabling extra retrieval. The archived-input smoke does NOT prove live three-quarter evidence retrieval or worker job completion.
6. Migrate/reconcile approved legacy checkpoints separately, with an audit trail, then measure actual coverage. Existing pending-company counts have not been reduced by these deployments.

This stage does not promise that every company receives a classification or that any lifecycle predicts future stock returns.

## Bounded live pilot — 6 October 2026

Two private evidence requests targeted the quarter ending 31 March 2026, with information cutoff 6 October 2026. These invoked live Google research, unlike the archived-input smoke above. They did not create worker jobs, write Firestore records, promote companies or change public history-fetch settings.

- LT: 62 seconds, zero canonical candidates; diagnostics included an unretrievable known official document and no verified factor comparisons.
- INFY: 82 seconds, zero canonical candidates; direct-document extraction ran, but comparison-basis and metric-mapping checks rejected the output.
- Neither request produced a publishable score or a new lifecycle assessment. Coverage remains unchanged. Google model/infrastructure charges are separate from Codex credits.

Follow-up corrections exclude stored anchors belonging to a different historical quarter, constrain extraction to registered comparison/accounting bases, repeat the target-quarter instruction in direct-document extraction and reject wrong-quarter rows before admission. These corrections were followed by the second bounded pilot below; unrestricted backfill remains disabled.

A subsequent explicitly capped two-request pilot, after those corrections and with full issuer names, also failed to qualify evidence: LT took 57 seconds and INFY took 70 seconds, both with zero canonical candidates and no verified factor comparisons. Four historical gateway requests in total were made across the two pilots; internal gateway research may involve more than one model call per request. No new lifecycle was published. The remaining blocker is reliable, archive-bound four-factor historical acquisition, not merely the UI or job queue. Automatic historical fetching stays disabled.

## Legacy accounting-scope reuse audit

`scripts/audit-fcs-history-reuse.ts` performs a read-only check of 33 canonical reconstruction artifacts against the 58-company library. It combines split records, deduplicates exact semantic observations, rejects conflicting candidate IDs, verifies referenced local archive bytes against hashes, re-scores each company/period and applies the quarterly history gate. It does not import anything into Firestore or the frontend.

The history gate now accepts explicit legacy accounting-scope labels already present in those source records (for example consolidated Ind AS and issuer-defined segment basis). It preserves each exact label in the comparability signature; these scopes are not normalised into or equated with one another. Unknown scopes remain blocked. Scoring weights and lifecycle thresholds are unchanged.

After this compatibility correction, 30 companies have at least one reusable quarterly checkpoint in the audited canonical artifacts. Granules has one complete comparable triplet ending 30 June 2026, classified Established by the existing V2.1 rules. This is a dry-run finding, not a newly published result. There are 32 company/period groups failing the four-factor scoring gate and four failing quarterly admission, including annual/YTD inputs. These are group counts, not distinct company totals. Other legacy lifecycle sources are not fully represented by these canonical artifacts; this audit does not invalidate or remove older published assessments.

## Final deployment verification for this run

- Private worker: `fcs-review-worker-historyscope1006`, serving 100% worker traffic; extra historical fetching remains `false`.
- Beta: `alphasynth-equity-historyscope1006`, reached through the `expectation-pilot` tag. Main remains 100% on `alphasynth-equity-dossier17`.
- Public beta capabilities: request/status configured and available; three comparable checkpoints required for lifecycle.
- Final private archived-input smoke: Hindalco FCS 41/raw -0.351 and LT FCS 75/raw 1.0022 reproduce approved scores. This smoke creates no jobs and invokes no research.
- TypeScript, production build, evidence adapter, runtime/contract, activity and history tests pass. No browser-interaction verification of the newly added chart scrolling is claimed.
- No legacy checkpoints migrated or pending company counts reduced in this run. Automatic historical acquisition remains an open release gate despite the deployed UI/worker fixes. Do not market this as a universally completed on-demand lifecycle engine.
- Last allowance check: 87% five-hour and 60% weekly remaining; paid Codex balance unchanged. Separate Google research/build charges were incurred and have not been measured here.
- X wording saved in `docs/X_BETA_INVITATION.md`; no post was published.

The validation company-selection control also brings the selected chart into view and moves keyboard focus there, respecting reduced-motion preferences. Frozen validation scores and classifications are unchanged.

## 6 October follow-up: live history proof and remaining coverage gate

The original scroll correction affected only the V1 tracker. The user-facing V2 validation page uses `SignalTrackerV2Comparison.tsx`; its company-selection handler is now corrected. Browser verification on the beta selected Dr. Reddy's, brought the chart to approximately 96 px below the top of the viewport and focused the chart region. Frozen study inputs and classifications were not changed.

Official-source discovery now supports explicitly dated Infosys quarter indexes and paired current/prior-year releases. The producer records separate publication dates, SHA-256 identities and private archive URIs for the two values. Historical requests carry the exact current metric definitions so cached or newly extracted history cannot silently substitute metrics, units or consolidation scope.

Cloud retrieval of the official release PDFs failed even though local direct acquisition succeeded. Six original issuer PDFs and six original announcement pages were therefore captured by `collect-infosys-quarter-cache.ts`. The private deployment cache verifies URL and SHA-256 before reading original bytes. It does not contain model summaries, invented publication dates or financial estimates. The announcement pages establish the original publication dates; capture dates are not used as publication dates. Future filings not in this cache still require successful live acquisition. This is **not** proof of a universally working cloud downloader or an automatic cache-refresh schedule.

The deterministic Infosys adapter reads reported quarterly revenue, reported IFRS operating margin, quarterly large-deal TCV and quarterly free cash flow. Annual/YTD totals and adjusted margins/cash flows are excluded. All six original PDFs passed local extraction and publication-cutoff tests. The live March 2026 pilot produced four qualified factors, two original archived documents and a publishable authoritative score in seven seconds, without a model call on this successful path.

The private worker's bounded historical stage is now enabled: at most two missing quarters and a three-minute combined history budget. A real Cloud Tasks review for Infosys, information cutoff 2026-10-06, completed and published:

| Quarter ended | Period | FCS | Weighted raw score |
| --- | --- | ---: | ---: |
| 2025-12-31 | Q3 FY26 | 52 | 0.0890 |
| 2026-03-31 | Q4 FY26 | 55 | 0.2001 |
| 2026-06-30 | Q1 FY27 | 63 | 0.5027 |

Its lifecycle is **BUILDING**, reporting history ending 2026-06-30, calculated with evidence available through 2026-10-06. All three quarters use the same four metric definitions and existing scoring/classifier policy. The older frozen Infosys report includes PAT in addition to revenue; the new internally comparable series uses revenue as its earnings metric. Therefore the old 45/Fading snapshot and new 63/Building assessment are not a like-for-like test of time alone. Neither the old evidence nor the frozen labels were overwritten.

The current report is exposed by the beta result endpoint and displayed above the earlier snapshot on the company's FCS page. Opening the company performs a read-only publication lookup, never starts research. A failed lookup offers retry guidance; current report details show the actual prior/current values and official-source links. The global FCS activity control also retains the completed review.

An additional L&T review failed closed: the NSE source returned HTTP 403 and could not be archived. It published no new FCS or lifecycle. Its earlier static report remains intact. Wider issuer acquisition still needs correction; no bulk retry was started and no testers invited.

Coverage remains **58 static four-factor records, 18 lifecycle-ready companies and 40 history-pending companies**. Infosys is an updated assessment of an already covered company, not a nineteenth distinct lifecycle company. The frozen 50-company validation remains 13 lifecycle-ready and 37 pending, because new October assessments must not rewrite an August study.

Tests: TypeScript compilation, production build, paired-document canonicalization, quarterly history/retention/policy parity, quarterly parser and six-original-PDF/cutoff verification pass. `verify-fcs-live-history-publication.ts` checks the actual public result, all three checkpoint signatures and the six original PDF identities against locally captured bytes. The successful adapter uses no Gemini calls; failed generic retrieval pilots did use model calls. Google infrastructure/model charges are separate from Codex credits and are not quantified here.

Deployment: private worker `fcs-review-worker-00020-f9h` (archive-quarter image with history enabled); beta `alphasynth-equity-historyreports1006`. Main remains on `alphasynth-equity-dossier17`. The release gate is now **broader verified history coverage**, not a missing worker flag. Do not advertise universal lifecycle readiness or invite testers on the assumption that all pending companies are complete.

Final allowance check for this follow-up: 30% five-hour and 51% weekly remaining. The paid Codex credit balance was unchanged at 1508.29712. This does not imply that Google deployments or failed research calls were free.

## 7 October: issuer fallbacks, HCLTech and live publication visibility

The archive-only reuse audit was repeated first: 30 companies have at least one reusable canonical quarter, but only Granules has a complete comparable triplet in those reconstruction files. Granules was already lifecycle-ready, so this audit alone adds no distinct company. No synthetic checkpoints or neutral substitutes were imported.

### L&T source-access repair — live verified

L&T's issuer download index and corporate results calendar now identify the exact analyst presentations and their explicit release dates. Three original PDFs (December 2025, March 2026, June 2026) were acquired from `investors.larsentoubro.com`, hashed and retained. The parser reads quarterly columns in Key Financial Indicators, separately from nine-month/full-year columns. CFO explicitly excludes Financial Services business; this issuer-defined scope is retained. Revenue and order inflow use the issuer's rounded INR-billion table values, not inferred unrounded numbers.

The source resolver, parser, canonical adapter, authoritative scorer and history gate passed. A real worker job `lt-86feb781-0d6c-476c-8471-b87bef4b3999` published FCS 83 / 65 / 53 across those quarters and **FADING** through June 2026, with all three original PDF identities and actual page 5 / 5 / 7 locators verified. This fixes the blocked NSE acquisition path for this supported issuer/template, not for every company. L&T was already covered; it does not increase the distinct lifecycle-company count. Its older 75/Rebounding snapshot used a different metric set and remains preserved, not rewritten as a like-for-like time comparison.

### Capped pending-company pilot and targeted HCLTech correction

One generic job each was started for HCLTECH, TCS and WIPRO. HCLTECH initially admitted only revenue; TCS and WIPRO returned no verified four-factor comparison. All three attempts ended incomplete, without estimated scores. HCLTech diagnostics included an unretrievable older guessed Q2 URL and unsupported PAT extraction. No repeat generic model loop was started.

HCLTech's own fiscal-year/quarter index now supplies the exact release URLs. Publication dates are read from the labelled Investor Release covers, not upload-directory names or quarter-end dates in covering letters. Six original releases, covering each current/prior-year pair for December 2025, March 2026 and June 2026, are hash-bound in the private cache. The initial conservative cover matcher rejected the explicit Q4 & Annual title and the June covering letter; the corrected matcher recognises the explicit quarterly title and uses only labelled release dates. It still rejects conflicting release dates.

The deterministic HCLTech parser reads consolidated IFRS quarterly revenue, quarterly EBIT margin, quarterly new-deal TCV and net cash at the quarter end. Annual TCV, LTM cash conversion, gross cash and annual cash-flow totals are not substituted. Operating margin explicitly excludes the one-time New Labour Codes impact where reported, while restructuring costs remain included. This accounting scope and the exact source notes are carried into the report. Net cash is compared against the same quarter-end one year earlier using paired issuer documents, not the varying March baseline in older snapshots. Source values retain the original precision (including the prior-year decimal USD revenue figures); they are not rounded to manufacture agreement with another filing.

All six originals passed cover, fiscal-quarter, table-column, unit, ambiguity and period tests. The comparable local series is FCS 66 / 44 / 72 and **REBOUNDING**, ending June 2026. The current series uses revenue instead of the older PAT input and a different net-cash comparison; the old 65 snapshot is not silently reinterpreted or overwritten. The deterministic live worker job `hcltech-a7bd8e86-3db7-4ad7-9630-3ebb2a7f1afe` completed successfully. `verify-hcl-live-history-publication.ts` verified the actual public result, all three checkpoint signatures, all six original PDF hashes/private archive links and the distinct previous/current PDF page locators. HCLTech is one additional lifecycle company: **19 ready / 39 pending among 58 four-factor library companies**. Frozen forward validation remains 13 ready / 37 pending among 50.

### Publication visibility and refresh behaviour

The private worker can now list at most 200 latest ledger records, read-only. Its public bridge returns only successfully published report summaries, excluding private diagnostics, candidate ledgers and credentials. A ten-minute issuer-index refresh is bounded and separate from immutable PDF reuse; failed HTTP/redirect checks fall back to hash-verified index originals. Live lookup does not overwrite captured originals. Future unsupported/unretrievable filings can still leave history incomplete; no universal downloader or freshness guarantee is claimed.

The research library merges successful current publications over its static records when opened, updating current FCS, lifecycle readiness and dated history. Public-list reads are cached for 60 seconds per beta instance to limit database reads. Unknown companies are not silently inserted into the static qualified library. Earlier reports remain available if lookup fails. Neither the frozen forward-validation data nor its lifecycle labels are merged with these October assessments. The earlier report is labelled Original library snapshot, and the current report exposes source notes and links to both source PDFs with their separate page locators.

Live-list inspection exposed old pre-history worker records without current-quarter checkpoint metadata, including the previously diagnosed Hindalco 59 result from before the derived-margin repair. Such legacy results are excluded from automatic library replacement and the latest-report overlay. Additionally, the result/status projection rejects the known Hindalco absolute-EBITDA policy mismatch and explains that reconciliation is needed; it does not rewrite the original ledger or substitute a fabricated score. The already-qualified 41 library report remains intact. Contract regressions prove that the correctly derived-margin 41 result remains publishable and that an explicit unavailable flag is not overridden merely by the old stored ready status.

Local verification: TypeScript, production build, existing worker/runtime/history policy parity, L&T original-source/history/publication checks, HCL original-source/history/live-publication checks, publication-list storage and immutable merge tests pass. Browser regression selected Dr. Reddy's from the validation table and confirmed keyboard focus plus chart position approximately 96 px below the viewport top. Final publication UI and safeguards deployment verification remain the final checks for this batch.

No new tester invitation or X post was sent. TCS/WIPRO and wider pending-company acquisition remain unresolved. The successful deterministic issuer paths make no model calls; the failed generic pilots did invoke research. Google charges are separate from Codex usage.

Final live checks: beta `alphasynth-equity-historypublish1007`, private worker `fcs-review-worker-historypublish1007`. The publication endpoint now returns only HCLTECH, INFY and LT as current checkpoint-bound series; legacy checkpoint-free worker scores are not merged into the current library. Browser verification confirmed **58 records / 19 lifecycle-ready / 39 current-FCS-only**, HCLTech's row at FCS 72/Rebounding with history through 2026-06-30, and its actual three-quarter report, separate source notes, original library snapshot and current/prior PDF page links. Verification image: `output/fcs-history-hcl-20261007.jpg`. Main remains on dossier17, and the frozen 50-company validation is untouched. No new research jobs remain in progress in the capped batch.

The UI originally showed 18/40 during the asynchronous publication-list lookup and updated to 19/39 after that read completed. The read-only feed also briefly returned unavailable during private-worker deployment; a later check succeeded, without starting more research. Old direct private status probes encountered HTTP 429, while the normal public status bridge and persisted ledger reads worked; those probes were not used as evidence that jobs had failed.

This batch closes the tested source-access and publication plumbing changes, **not all pending company evidence work**. Automatic historical reconstruction is live-proven for INFY, LT and HCLTECH. The other 39 library companies still need complete, comparable historical acquisition or harmonisation before new lifecycle publication. Keep tester invitations on hold if broader lifecycle coverage remains the acceptance criterion.
