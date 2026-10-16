# Shared FCS fixes — not yet deployed

## 16 October continuation (local only)

Added `src/fcs-factor-context.ts` and connected it to the extraction request in
`server.ts`. Each factor now receives bounded, numerically dense passages from
the original retrieved filings instead of repeating up to six entire filing
texts. The full originals are still fetched and checked by the unchanged
source-value, date, unit, issuer, archive and publication gates before any
factor can be admitted. This is a generic context-selection change, not a
Solar-specific exception, and it does not by itself establish correctness.

Offline checks passed: `verify-fcs-factor-context`, `verify-fcs-factor-extraction`,
`verify-fcs-source-match`, `verify:fundamental-review`, `npm run lint`, and
`npm run build`. No new model call, FCS request, deployment or publication was
made in this continuation. Last usage check: 22% five-hour and 57% weekly
remaining; paid-credit balance unchanged at 623.764323. Next, stage the local
evidence changes in a zero-traffic revision and run one capped Solar test only
with enough included allowance, then inspect four-factor source verification
before claiming readiness. Beta `expectation-pilot` remains UI-only `ui1016`.

Two-agent investigation established that Solar's BSE PDF embedded OCR text is corrupted, not just that model output is malformed. See tmp/pdfs/solar-source-audit.pdf and solar-source-page3.png. Visible June26 revenue3668.20 crore reads3888.20 in text; model also misassigned columns. Source rejection was justified. Official NSE structured HTML tmp/solar-structured.html / tmp/pdfs/solar-source-ixbrl.html has correct raw amount366820 INR lakh and D/E0.26; only current+YTD, so prior comparison needs a second dated filing. Do not hardcode Solar figures or weaken gates.

Implemented local shared changes:
- src/fcs-factor-extraction.ts: explicit Gemini2.5 thinking budgets2048/1024 within6144/8192 output caps; rejects MAX_TOKENS even parseable fragments; bounded retry; records numeric token usage. server.ts integrated.
- src/fundamental-review-source-match.ts: exact Indian grouped numbers, explicit numeric dates; rejects malformed numbers/OCR guesses.
- src/fcs-firecrawl-discovery.ts: two bounded searches including NSE structured filings; structured URL priority. server.ts prioritizes structured exchange candidates and instructs model to prefer them.
- src/fcs-evidence-normalization.ts: explicit INR lakh->crore denomination conversion after raw source-value verification; server preserves source values/unit/conversion in admitted rows and adds INR lakh to extraction-only units. Authoritative registry unchanged.
- scripts/test-fcs-staging.ps1: revision/time-specific results avoid overwriting old observations; saves provider payload too.

Targeted factor extraction, source match, discovery, normalization tests passed. TypeScript integration check requested after final edit; see turn output for result. No new deploy/live model calls in this resumed turn. Existing staging remains fcsnormalizeb1015, beta unchanged.

Next: review integration and tests, then deploy isolated staging with900s timeout and run Solar once using revised runner. Establish full four-factor canonical/scorer acceptance before broader cases. Need verify structured discovery actually returns current+prior filings and source date metadata; no reliability claim yet. UI/durable worker/n8n end-to-end not yet verified for new code.

Usage cutoff: session began97% five-hour remaining/84%weekly,682.028592 paid credits. Last check five-hour exhausted/69%weekly remaining,635.960692 paid. Stop further development/deployment until user resumes; monitoring was too infrequent to prevent paid usage.
# 16 October staging update (no beta promotion)

- Codex included usage was 48% remaining in the five-hour window and 49% in the weekly window at the first check; paid Codex balance remained 623.764323. Do not conflate this balance with Firecrawl or Google Cloud API charges.
- Deployed zero-traffic candidate `alphasynth-equity-fcsunits1016`; `expectation-pilot` still targets `alphasynth-equity-ui1016`, and production traffic remains 100% on `alphasynth-equity-dossier17`.
- The official NSE iXBRL HTML transport fallback works: the earlier Solar run retrieved four original HTML pages through Firecrawl. Its current Q1 FY27 filing declared INR Lakhs, while the prior Q1 FY26 filing declared INR (in Actuals). Code now accepts separate, explicit denominations and normalizes only after the two raw source values and units have been verified independently. The normalizer has a local cross-filing fixture test.
- One capped Solar run against `fcsunits1016` took 137 seconds, retrieved six documents (87,655 text characters), and all four factor extraction calls completed. It returned **zero admitted factors**. Seven model candidates were rejected: three used a common `Rs. In Cr` unit phrase not recognized by the initial normalizer, and four had source values that did not verify in the cited filing. No FCS report or lifecycle was published.
- The unit synonym `Rs. In Cr` is now accepted locally, but this has **not** been deployed or live-retested. It only allows those candidates to reach exact source-value validation; it is not evidence they will pass. Stop additional live trials until the model is made to associate each figure with the correct structured filing table and period. The existing `source_values_not_verified` rejections must not be bypassed.
- End-of-turn Codex usage: 33% remaining in the five-hour window, 46% remaining in the weekly window; paid Codex balance still 623.764323. The staging request also consumed external provider calls, whose billed amount was not measured here.
- Next acceptance gate: deterministic source/table/period association, then cross-industry tests (at least manufacturing, IT, banking, healthcare). A single-company retrieval improvement is not evidence of reliable on-demand FCS. Keep all new request buttons gated on a demonstrated completion rate, not mere document availability.
