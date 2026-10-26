# Claude handoff — AlphaSynth on-demand FCS beta (as of 21 Oct 2026)

Read this first in any new session. It replaces re-explaining the history.

## Goal (owner)
Prove the **beta** can generate an **on-demand FCS report and a three-quarter
lifecycle**, then invite testers. Non-commercial beta; owner accepts unverified
provider data if clearly labelled, and will handle Tapetide terms personally.

## Ground rules
- Work only in `C:\Users\admin\Documents\Claude-AlphaSynth\` (copies of
  `alphasynth-equity` and `alphasynth-bms-v2`). Never edit
  `Documents\ChatGPT\Alphasynth Intelligence\` (ChatGPT/Codex tree).
- Test only on the private Cloud Run service `alphasynth-fcs-claude-test`
  (project `my-nse-research-app`, us-central1, runtime SA
  `fcs-claude-test@…`). Do NOT touch beta (`expectation-pilot` tag → ui1016),
  main (100% → `alphasynth-equity-dossier17`), `fcs-review-worker`, or n8n
  without explicit owner approval.
- Ask before paid calls beyond what the owner approved. Report honestly.
- Claude cannot `git push` (app permission check). The owner pushes from their
  own PowerShell: `git -C "C:\Users\admin\Documents\Claude-AlphaSynth\alphasynth-equity" push`.

## GitHub (source of truth)
- `alphasynth-equity`: ChatGPT work on `codex/checkpoint-20261016` (9d60f0f).
  Claude work on `claude/fcs-mixed-source`: ff7d42d (pushed), e494984 and
  8090b53 (local, **not yet pushed**). `main` untouched (7eedea1).
- `alphasynth-bms-v2` (scorer): `codex/contracts-v2` (2024902), unchanged by Claude.

## Owner decisions (in order)
1. Earnings + Economics from **Tapetide** quarterly financials, labelled
   "not cross-verified with NSE/BSE", scored in the provisional lane.
2. Publish only with all four factors.
3. Jun/Dec quarters may use the latest Mar/Sep balance sheet (Option 1).
4. Segment lock / order book first for Execution; printed "Total Debt" for
   official Balance Sheet; lifecycle pending is reported with a dated reason (Option C).
5. **Beta source policy (21 Oct):** Balance Sheet from Tapetide's latest
   **annual** balance sheet (Borrowings = total debt, 31 Mar vs prior 31 Mar,
   used for every quarter, labelled "as at"); Execution from **Tapetide-parsed
   concall transcripts / presentations** (value must appear beside its label
   in that text; page recorded). Official PDF extraction only as fallback.
6. Beta = on-demand only.
7. **Tapetide Free plan ONLY (22 Oct, applies to all future builds):** 50 calls/day,
   resets 00:00 IST. Never plan around the Starter/paid token. Split cohorts into daily
   batches (~45 calls/day budget) and stop cleanly at the limit; slower is fine.
   25-company coverage test (list agreed 22 Oct: TVSMOTOR, BAJAJ-AUTO, MARUTI, LT, BEL,
   THERMAX, INFY, HCLTECH, PERSISTENT, SUNPHARMA, DRREDDY, CIPLA, ULTRACEMCO, HINDALCO,
   TATASTEEL, VOLTAS, CROMPTON, TITAN, TRENT, DMART, BHARTIARTL, INDIGO, POWERGRID, SRF,
   ASIANPAINT) to run in daily batches after the Eicher/Havells rerun — awaiting the
   owner's approval of the batch plan.

## What exists (all in the Claude copy, tests pass: 18 suites + lint + build)
- Provider-first evidence route in `server.ts` (`/internal/fundamental-review/evidence`).
- `src/tapetide-fcs-evidence.ts` (Earnings/Economics), `src/tapetide-fcs-balance-sheet.ts`,
  `src/tapetide-fcs-documents.ts` (Execution from parsed docs), `src/tapetide-fcs-provider.ts`
  (quota error, 30-min shared cache, annual BS fetch), OCR for scanned PDFs (Document AI
  processor `projects/470912802345/locations/us/processors/53e6c39477719bd7`, on only for
  the test service), lifecycle-pending reasons, segment alignment helper (not wired to worker).
- Key offline proof: `npm run verify:tapetide-beta-sources` (three quarters → lifecycle).

## Evidence so far
- Solar Industries: live **FCS 74** (Q1 FY27) on the test service. Lifecycle not formed
  (annual-only debt, segment re-cuts) — the reason the beta sources were changed.
- Phase A cohort (old pipeline): 0/6 published (HAL, EICHERMOT, KPITTECH, GLENMARK,
  MARICO, HAVELLS); Earnings/Economics always worked, Execution/Balance Sheet failed.
- Tapetide check: balance sheet is annual only; parsed concalls exist (HAL up to May 2026,
  Eicher up to Aug 2026); each listing has `links.markdown_url`.

## BLOCKER found 21 Oct
The `TAPETIDE_TOKEN` in Secret Manager is a **Free-plan** token (50 calls/day), not
the owner's Starter token. Free quota was exhausted on 21 Oct (resets 00:00 IST).
Owner intends to replace it (command below). The run works on Free too, if small.

## NEXT STEP (start as soon as the owner resumes on the morning of 22 Oct)
Owner's instruction (21 Oct): run this on the **Free-plan token as it is** (50 calls/day,
fresh after the midnight reset) when they resume work in the morning — not at midnight,
and no token change needed. Pre-approved; start without asking again.
1. Confirm `claude/fcs-mixed-source` at 8090b53 (or later), nothing uncommitted.
2. Redeploy ONLY `alphasynth-fcs-claude-test` from the copy
   (`gcloud run deploy alphasynth-fcs-claude-test --source . --project=my-nse-research-app
   --region=us-central1 --no-allow-unauthenticated`); if upload stalls >10 min, stop and retry.
3. Run `scripts/run-claude-fcs-beta-proof.ps1 -Cutoff <today>` in the background
   (EICHERMOT, MARICO, HAVELLS, KPITTECH, GLENMARK, HAL; current FCS → history → lifecycle;
   stops cleanly on the Tapetide limit). Expect ~3–5 Tapetide calls/company.
4. Report per company: published?, FCS, source of each factor, lifecycle, Tapetide calls,
   whether Markdown links worked. Confirm beta/main/worker unchanged.
5. If it works: propose the beta release (TAPETIDE_TOKEN + new code on the worker and a
   new beta revision; main untouched) — needs explicit owner approval.

## 22 Oct results (Free-plan token, test service revision 00009)
- Current-quarter FCS published for **5/6**: Eicher 72, Marico 67, Havells 49, KPIT 24,
  Glenmark 86 (3 Tapetide calls each). HAL failed: no Q1 FY27 transcript in Tapetide.
- **Lifecycle proven on live data for Glenmark**: Q3 FY26 73 → Q4 FY26 86 → Q1 FY27 86,
  ESTABLISHED, after aligning Execution on the segments common to all three quarters
  (India, Europe). Offline proof: `node --experimental-strip-types scripts/assess-claude-fcs-history.ts GLENMARK 2026-10-22`.
- Other lifecycles blocked by Execution missing in earlier quarters (March-quarter calls
  often discuss only full-year figures) — a disclosure gap, not a code bug.
- Fixed today: Markdown wrongly rejected as HTML; read_document max_chars; counted nouns →
  units; spoken period wording; unit spelling (Rs.Cr = INR crore, vehicles = units); CCG
  rows refused as volume; test runner balance-sheet rule; cross-quarter Execution alignment
  now in the worker (`verify:fcs-worker-alignment`).
- Not yet deployed to the real worker/beta; that is the next step and needs owner approval.

## 22 Oct (later): March-quarter Execution test (offline, 4 Tapetide calls)
- Havells needs no derivation: the Q4 FY26 vs Q4 FY25 segment table is printed in the
  22 Apr 2026 "Information Update" (Tapetide doc 10525236, listed as a concall, page 5).
  The pipeline read only the first 2 of 4 April documents, which were copies of the call
  with growth % only. Fix: download every results-window document via its free Markdown
  link (dedupe), prefer ones with a table for the target quarter.
- Eicher: Q4 FY26 derived = FY26 "12.27 lakh" − printed Q1..Q3 (914,166) = 312,834 ±500.
  Method checked on FY25: 1,002,893 − 722,092 = 280,801 = Q4 FY25 as printed.
  FCS is identical at both rounding bounds.
- Simulated lifecycles (scratchpad simulate-q4.ts): Eicher 74 → 71 → 72 RECOVERING;
  Havells 66 → 65 → 49 FADING. With Glenmark that is 3 of 6.
- Built offline (owner approved): `src/fcs-derived-quarter.ts` + `tapetideExecutionEvidence`
  now (a) downloads every results-window document via its free link, de-duplicates
  re-parses, reads table documents first (max 3 model reads); (b) for a March quarter with
  no printed comparison, derives Q4 = FY − (Q1+Q2+Q3) for additive metrics only, each
  component verified beside its label in its own results document; refuses if rounding
  could move growth > 0.5 pp or Q4 is outside 0.5–2× the Q1–Q3 average; prior-year Q4 may
  be printed (e.g. Eicher May 2025 call). Labelled "derived" in the report and lifecycle
  table. No extra Tapetide calls (listing now concall+presentation, ~20 months, limit 40);
  up to ~10 Gemini reads per derived quarter. Test: `npm run verify:fcs-derived-quarter`.
- Deployed ONLY to the test service (revision 00010-br6, code = a6eb898; 302b441 adds a
  `-Symbols` filter to the proof script). The live rerun has NOT happened yet: the first two
  tries got Cloud Run 429 "no available instance" right after rollout (max 1 instance); the
  third reached the app but the Free Tapetide quota for 22 Oct was used up. Next: after
  00:00 IST run `scripts/run-claude-fcs-beta-proof.ps1 -Cutoff <date> -Symbols EICHERMOT,HAVELLS`
  (wait ~5 min after any deploy). Beta/main/worker confirmed unchanged.

## 23 Oct results (Free plan, test service revision 00011-sv5, code 68aea8f)
- **Lifecycles proven live:** Eicher Q3 FY26 74 → Q4 FY26 71 → Q1 FY27 72 RECOVERING;
  Havells 66 → 65 → 49 FADING. With Glenmark (22 Oct) that is 3 live lifecycles.
- Havells Q4 FY26 from the Information Update table (doc 10525236 p5), Q1 FY27 from the Q1
  Information Update (doc 23531160 p5). Eicher Q4 FY26 was found PRINTED (313,811 vs
  280,801, doc 15306548 p76), so no derivation was needed this time.
- Fixes from today's first pass: Execution label hint for history (Eicher picked VECV trucks);
  near-duplicate rule only for similar-sized docs (Havells update was dropped); Tapetide
  quota latch until 00:00 IST (06b6043).
- Derivation margin corrected after comparing with the printed 313,811: Eicher's FY26
  1,227,977 was printed as "12.27 lakh" (truncated), so components now carry ±1 unit of the
  last printed digit (not ±½). Committed after 68aea8f; not yet deployed.
- Tapetide calls 23 Oct: 21 of 50.

## Owner commands
Replace the Tapetide token (paste token when prompted):
```powershell
$t = Read-Host "Paste your Starter Tapetide token" -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($t)) | & "C:/Users/admin/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd" secrets versions add TAPETIDE_TOKEN --data-file=- --project=my-nse-research-app
```

## Owner decision: beta is the product (21 Oct)
The owner does not need the V1 build. Main (`dossier17`) differs only by the legacy
477-company BMS V1 "Momentum Universe" panel and old trading-style Deep Dive sections;
the beta (`ui1016`) already covers all of main's API features plus 12 more. When the
FCS beta is proven, main can be replaced by the beta (separate, explicitly approved step).
Main's BMS panel occasionally shows "service unavailable" when its call to `bms-api`
times out at 10 s on a cold start (seen 21 Oct 12:45 IST); not worth fixing in V1.

## Live URLs (21 Oct)
- Main (live, 100%): https://alphasynth-equity-oqc2y4ogda-uc.a.run.app (revision dossier17)
- Beta tag: https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app (revision ui1016)
- Neither contains the Claude FCS work yet.

## 23 Oct (later): beta readiness + deploy plan
- Committed 3f86820: daily-limit pause until 00:00 IST (evidence route stops, worker marks
  DATA_PROVIDER_DAILY_LIMIT, repeat requests return the paused job), bank/NBFC/insurer gate
  (59 of 250 large/mid caps declined before any call), history time budget via env, wording.
- Read-only check done; `docs/BETA_DEPLOY_PLAN.md` holds the exact deploy/rollback steps.
  Main does not use the worker. Worker lacks TAPETIDE_TOKEN, Vertex AI, bucket access and
  memory; plan grants them. NOTHING deployed to worker/beta yet — awaiting owner approval.

## 23 Oct: BETA DEPLOYED (owner approved steps A–C of BETA_DEPLOY_PLAN.md)
- A: fcs-worker@ granted TAPETIDE_TOKEN secretAccessor, roles/aiplatform.user, bucket
  objectCreator + objectViewer.
- B: worker revision `fcs-review-worker-claudebeta1023` (code 4320b11) serving 100% of the
  worker; 2 CPU / 2 GiB; adds TAPETIDE_TOKEN, GCP_PROJECT_ID/REGION, archive bucket,
  FCS_HISTORY_BUDGET_MS=300000, FCS_HISTORY_REQUEST_MS=150000; all old settings kept.
- C: beta revision `alphasynth-equity-fcsbeta1023` (template settings identical to ui1016),
  0% traffic; smoke-tested (site, capabilities, preflight, publications, bank decline 409,
  no console errors); tag `expectation-pilot` moved to it. Main still 100% `dossier17`.
- Rollback: see BETA_DEPLOY_PLAN.md (worker → 00026-gg9; tag → ui1016).
- NEXT (step D, 24 Oct on fresh Free quota, pre-approved): request EICHERMOT through
  https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app, wait for FCS +
  lifecycle, check labels; bank decline already verified.
- Step D (23 Oct, 06:51 UTC): Eicher via the beta link → 3 of 4 factors, no FCS. Cause: the
  model labelled the right Q1 row (261,326 → 332,940 motorcycles) "quarter sales" (too generic
  to verify) and the other document's attempt picked VECV trucks. The beta and worker themselves
  worked end to end (queue, Firestore, Tapetide 3 calls, Gemini, archive).
  Fix 4f38a0f (counted noun as label; prefer main business) — NOT yet on the worker; redeploying
  the worker needs owner approval. Tapetide calls 23 Oct ≈ 24 of 50.
- Worker redeployed (owner approved): `fcs-review-worker-claudebeta1023b` (code 4acebd2).
- Step D rerun via beta (07:04 UTC): **Eicher FCS 72 published live on demand** (4/4 factors,
  45 s, 3 Tapetide calls; history reused the cache = 0 calls). Lifecycle pending: Execution not
  aligned across quarters — Q1 row labelled "quarter sales", Q4 "Total Volumes" (two rows: RE and
  VECV), Q3 picked VECV HD trucks. Next fix (offline, needs approval to redeploy): keep the printed
  unit noun ("motorcycles") as the row's identity/hint, and in history pick the row whose size
  matches the current quarter's series (RE ~3 lakh vs VECV ~25k).
- Cost finding: a full on-demand review through the worker costs ~3 Tapetide calls (history
  reuses cached financials/listing), so the Free plan allows ~15 full reviews/day.
- Tapetide calls 23 Oct ≈ 27 of 50.
- Lifecycle-matching fix built offline (owner approved; NOT deployed):
  1. Each Execution row keeps its printed noun (`unit_wording`, e.g. "motorcycles"); history
     uses it as the hint when the label is generic ("quarter sales").
  2. Alignment keeps, in each earlier quarter, only the row of the same size as the current
     quarter's series (0.5–2×; not for segments, percentages or order books) — VECV is left out.
  3. Stored quarters measured differently are measured again and replaced only if the new
     measurement publishes (`historical_checkpoint_remeasured` / `current_checkpoint_remeasured`
     diagnostics). Needed for Eicher, whose stored Q3/Q4 used VECV rows.
  Tests: verify:fcs-series-identity (new), verify:fcs-worker-alignment (remeasure case).
  Next: redeploy the worker (needs approval), rerun Eicher (≈3 calls), then 5-company batches.
- Worker redeployed (owner approved): `fcs-review-worker-claudebeta1023c` (code c1b05db) — includes
  the series-identity fix. Same-day Eicher rerun not possible: the worker returns the existing
  published job for the same information cutoff (by design, saves calls). Verified, 0 calls.
- NEXT (24 Oct, after 05:30 IST = new UTC date): 1) request EICHERMOT via the beta link — expect
  FCS + lifecycle (stored Q3/Q4 remeasured); 2) batch 1 of the 25-company test THROUGH THE BETA
  LINK (TVSMOTOR, BAJAJ-AUTO, MARUTI, LT, BEL), ~3 Tapetide calls each, one at a time.

## 24 Oct: first beta batch (live beta link, Free plan, 18 Tapetide calls)
| Company | Result | FCS | Lifecycle | Why pending / failed |
|---|---|---|---|---|
| EICHERMOT | published | 72 | pending | alignment skipped (stored current checkpoint from 23 Oct) — FIXED 27fb44a |
| TVSMOTOR | published | 57 | pending | vague spoken figures (70,000→130,000) passed — FIXED 27fb44a; quarters used different rows |
| MARUTI | published | 43 | **WATCH** (65→45→43) | — |
| THERMAX | published | 40 | pending | order book reported twice per quarter (YoY + QoQ) → alignment gives up; keep YoY (TODO) |
| DMART | published | 70 | pending | store count aligned but keys differ after rescoring (likely comparison basis/period) (TODO) |
| VOLTAS | 3 of 4 | — | — | Execution rows not found in text (refused correctly) |
| BAJAJ-AUTO, LT, BEL | refused | — | — | older built-in library report exists ("report_ready"); users cannot refresh it (DECISION) |
- Of the 25-company list, 15 are blocked by older built-in reports (BAJAJ-AUTO, LT, BEL, INFY,
  HCLTECH, PERSISTENT, SUNPHARMA, DRREDDY, CIPLA, ULTRACEMCO, HINDALCO, TATASTEEL, TITAN, TRENT,
  BHARTIARTL); CROMPTON is not enabled. Still requestable: INDIGO, POWERGRID, SRF, ASIANPAINT.
- 27fb44a (not deployed): alignment runs when all three quarters were measured in the run;
  vague period wording needs "Q1 FY27"/end date nearby. Test: verify:fcs-worker-remeasure.
- Validation study proposal: `C:\Users\admin\Documents\Claude-AlphaSynth\research\MULTIBAGGER_VALIDATION_STUDY.md`
  (session multibagger-study); needs owner approval of a ≤5-call probe and the daily call split.
- Batch tool: `node scripts/run-beta-fcs-batch.mjs <outDir> SYMBOL:Name ...` (results in output/beta-batch-*).
- Worker redeployed (owner approved): `fcs-review-worker-claudebeta1024` (code 65c88a0 = 27fb44a fixes);
  beta tag (fcsbeta1023) and main (dossier17) unchanged.
- NEXT (owner approved 24 Oct, offline only, with tests): fix Thermax (order book reported twice per
  quarter, YoY + QoQ → keep the year-on-year comparison) and DMart (store count aligned but keys
  differ after rescoring → find the cause from its stored job dmart-508ca1da-…, likely comparison
  basis or previous period). Report before any redeploy.

## 26 Oct: Thermax and DMart fixes (offline, owner approved; NOT deployed)
- DMart cause: store count was "same quarter prior year" in Q1 but "as at" in Q3/Q4, so keys
  never matched. Store count, customer base, loan book and AUM are now balances ("as at"), like
  the order book. Scorer check: DMart Q1 FY27 70 and Q4 FY26 71 publish with the same key as the
  stored Q3/Q4 (6e7e4aed).
- Also: "Q1/26"-style period wording (DMart tables) now counts as naming its year (the 24 Oct
  vague-period rule had refused it).
- Thermax cause: order book reported twice per quarter (vs a year ago and vs last quarter); the
  alignment now keeps the year-on-year comparison (else the longest) in every quarter.
- Tests: verify:fcs-series-identity (sections 5–6). All 21 suites, lint, build pass.
- NEXT: worker redeploy needs owner approval; then rerun Eicher, TVS, Thermax, DMart through the
  beta (~12 calls; mind the owner's daily C1 study batch of 40 calls).
