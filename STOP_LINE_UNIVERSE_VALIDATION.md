# AlphaSynth 25-company stop-line validation

## Purpose

This is the final breadth test before the AlphaSynth methodology is frozen. It is an acceptance audit, not a new research model and not a retrospective exercise for tuning BMS weights.

The cohort is the existing 25-stock signal-tracker cohort: five companies from each recorded BMS V1 lifecycle (`Watch`, `Emerging`, `Building`, `Established`, and `Fading`). It deliberately includes different sectors, evidence strengths and disclosure patterns.

## What the audit measures

For every company the script records:

- whether the official-evidence dossier completes without a technical failure;
- admitted official-source and supported-claim counts;
- usable quarterly rows;
- delivery components and delivery coverage;
- management-history status, commitments and matured commitments;
- qualification status without changing the recorded BMS V1 lifecycle;
- whether the complete payload passes the existing PDF-readiness gate; and
- the exact reason whenever an enrichment, overlay or PDF is unavailable.

A blocked PDF is an intended safety result when evidence is inadequate. It is not counted as a technical pipeline failure.

## Fixed acceptance thresholds

- Technical dossier success: at least **90%** of the cohort.
- Meaningful delivery overlay: at least **70%** of the cohort, defined as at least two comparable delivery components and at least 60% delivery coverage.
- Invented figures or commitments: **zero permitted**. This requires a manual cited-evidence review of a stratified sample after the automated run.
- Management scoring may honestly remain `insufficient_history`; absence must never be converted into a passing result.

The thresholds must not be changed after seeing the results merely to make the pilot pass.

## Cloud Shell run

From the repository directory on the `codex/server-dossier-pdf` branch:

```bash
git pull
npm run test:stop-line-universe -- \
  --cutoff=2026-09-11 \
  --base-url=https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app
```

The run is sequential because the evidence and Gemini services are rate-sensitive. Output is written to:

```text
/tmp/alphasynth-stop-line-20260911/
```

The final machine-readable result is:

```text
/tmp/alphasynth-stop-line-20260911/summary.json
```

If Cloud Shell disconnects or a transient provider error interrupts the run, resume it without repeating completed paid work:

```bash
npm run test:stop-line-universe -- \
  --cutoff=2026-09-11 \
  --base-url=https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app \
  --resume
```

For a one-company diagnosis:

```bash
npm run test:stop-line-universe -- \
  --cutoff=2026-09-11 \
  --base-url=https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app \
  --ticker=TITAN
```

For a bounded comma-separated repair cohort, use `--tickers=LT,ADANIENSOL,...` together with a new `--output` directory so the baseline evidence remains untouched.

Use `--skip-management` only for a non-mutating diagnostic run. The final acceptance run should include management history so that storage, insufficient-history handling and qualification are tested end to end.

## Decision rule after the run

1. Review the aggregate rates and the lifecycle breakdown.
2. Manually inspect at least one success and one incomplete case from every lifecycle represented by both outcomes.
3. Fix only recurring systemic defects that affect multiple companies or violate evidence integrity.
4. Re-run failed companies once using `--resume` after removing their saved result files.
5. If the fixed thresholds pass, review the candidate UI/PDF and promote it explicitly.
6. Freeze methodology and architecture. Subsequent work is limited to defects, factual corrections and minor cosmetics, followed by the carousel/landing-page presentation.

Company-specific scraping exceptions are not an acceptable route to passing this audit. If a company cannot be supported defensibly, the product should state that the dossier is unavailable.

## Baseline result — 11 September 2026

The first complete 25-company run did not pass:

- technical dossier success: **15/25 (60%)**;
- usable two-component delivery overlay: **15/25 (60%)**;
- PDF ready: **0/25**; and
- management scoring: insufficient live matured history across the cohort.

Every technically successful dossier produced the basic revenue-and-margin delivery bridge. The recurring failures were official-source discovery/date admission, only two complete report-facing BMS factor comparisons, and absent structured quality-gate evidence.

The bounded repair therefore does three things without changing BMS V1:

1. increases the bounded official search breadth and reuses the already-recorded official BMS evidence URL after revalidating it through the normal admission policy;
2. presents the published revenue-growth baseline as generic Execution evidence when Execution history is otherwise absent, without changing the recorded Execution or composite BMS score; and
3. recognises a wider but still explicit set of cash-flow, leverage, working-capital, concentration, ROCE and acquisition-dependence statements for gate observations.

It deliberately does **not** infer balance-sheet strength from the profit-and-loss table, convert insufficient management history into a pass, or weaken the PDF-readiness thresholds.

## First repair audit — 11 September 2026

A bounded rerun of the ten baseline failures plus five representative successes still did not pass:

- technical dossier success: **6/15 (40%)**;
- usable delivery overlay: **6/15 (40%)**; and
- PDF ready: **0/15**.

The Execution comparison repair worked in five of the six successful reports, but only JSWSTEEL recovered among the ten earlier technical failures. Quality gates remained the main PDF-readiness blocker: five successful reports had zero observed gates and SUNPHARMA had one.

The final bounded repair therefore preserves the acceptance thresholds and adds only reusable evidence plumbing:

1. the immutable tracker now hands the previously verified official source URL **and its recorded publication date** to dossier admission; both are revalidated against the company domain, exact-date and information-cutoff rules;
2. the Execution bridge repairs a nominally complete-but-empty factor row when genuine delivery comparisons exist; and
3. Gemini may return a structured quality-gate observation only as `pass` or `fail`, with an explanation and at least one admitted official source reference. Silence remains `unknown`, management history remains separate, and conflicting duplicate observations resolve conservatively to `fail`.

This is the last architecture-level repair in the stop-line cycle. If the fixed technical and delivery thresholds still fail after deployment and a targeted rerun, the honest product outcome is restricted dossier/PDF availability for unsupported companies—not more issuer-specific scraping rules or lower evidence standards.

## Disclosure-cadence correction

The stop-line audit also established that a fresh balance sheet cannot be a universal quarterly prerequisite. Earnings and profit-and-loss evidence are normally quarterly, whereas statement-of-assets-and-liabilities and cash-flow evidence is generally half-yearly or annual. The methodology now distinguishes `not_due` from `unknown`, `pass` and `fail` for cadence-limited gates.

- `not_due` never contributes a pass, failure or observed-gate count;
- an explicitly supported observation still takes precedence even in a non-mandatory quarter;
- the latest verified half-year or annual evidence may be carried forward only with its original period; and
- missing balance-sheet evidence is never represented as zero.

This correction changes presentation and evidence eligibility, not BMS V1 weights or historical lifecycle classifications.
