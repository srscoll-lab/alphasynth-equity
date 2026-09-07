# Dossier pilot repair — 7 September 2026

## Verified outcome

- Cloud Run candidate: `alphasynth-equity-dossier9`, tag `dossier-pilot`, zero normal production traffic.
- Production remains `alphasynth-equity-00013-vuq` at 100% traffic.
- Direct API acceptance test: HTTP 200 in 21 seconds, nonempty canonical dossier with three dated official sources.
- Full n8n manual-webhook acceptance test: all four nodes executed and the caller received HTTP 200 with the dossier body. Structural assertions passed.
- Negative full-webhook test (cutoff 2000-01-01): HTTP 422, four `post_cutoff` rejections and per-URL diagnostics. No empty/misleading HTTP 200.
- Workflow remains unpublished/inactive. No production webhook or application rollout was activated.

## Root cause and repair

Search returned investor-relations indexes, not the reports themselves. The old collector scraped markdown only; Radico's report anchors are PDF icons with the title outside the anchor. Important report links disappeared from markdown. The index was then rejected as undated.

The collector now examines bounded raw HTML from official indexes, follows relevant official PDF links, and reads exact dates from publication metadata or exchange cover letters. It does not use upload folders, fiscal years, or a landing page's date as a report's publication date. A regression also prevents embedded archive-ID digits being ranked as future years.

The n8n HTTP node now retains status/body and forwards non-2xx responses to Return Dossier. Return Dossier sends the real backend status/body; transport failures receive a generic 502. Its URL, encrypted Header Auth credential, JSON body mapping and inactive state were preserved.

## Admitted RADICO sources for cutoff 2026-09-05

- Earnings presentation, 2026-07-28: https://radicokhaitan.com/wp-content/uploads/2026/07/earnigspresentation.pdf
- Financial results, 2026-07-28: https://radicokhaitan.com/wp-content/uploads/2026/07/outcome28072026.pdf
- Earnings-call transcript, 2026-08-05: https://radicokhaitan.com/wp-content/uploads/2026/08/IntimationFinal.pdf

## Verification and recovery

- Local TypeScript checks, Vite production build, evidence-collector regression tests and existing dossier trust/integrity tests passed.
- Backend implementation commits: `4d09896`, `bf5141b`; test script: `7c40622`; candidate branch: `codex/dossier-import-fix`. Not merged to main by this repair.
- Cloud Shell results: `/tmp/dossier-direct-20260907.json` and `/tmp/dossier-webhook-20260907.json` (temporary files; preserve before the shell is recycled).
- n8n container backup: `/tmp/dossier-backup-20260907.json`; patched import: `/tmp/dossier-response-fixed-20260907.json`.
- Repeatable scripts: `scripts/verify-dossier-evidence.ts`, `scripts/verify-dossier-contract.ts`, `scripts/test-dossier-pilot.ts`.

## Content review remains required

Execution and source-reference validation are not independent verification of every generated claim. The successful webhook dossier labelled six business-risk items as `conflict`; a spot-check showed that these labels are not proof of contradictory sources. Review risk classification and claim wording against the PDFs before publishing or using the output for decisions. `humanReviewRequired` remains true, social analysis remains disabled, and social content cannot affect BMS.

## Deferred production UI cleanup

- Keep the current public landing page and Research Use Notice during the temporary pilot.
- Before the permanent production launch, remove/bypass that landing experience so the production URL opens the application directly. Preserve the research-use disclosure inside the application rather than as a blocking entry screen.

This repair does not claim universal coverage of all issuer websites. Undated evidence remains a legitimate, clearly reported rejection rather than permission to weaken admission rules.
