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
6. Beta = on-demand only. Owner is on Tapetide **Starter** (₹299/mo, 400/day).

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
