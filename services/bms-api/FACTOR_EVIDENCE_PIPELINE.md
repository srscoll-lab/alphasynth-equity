# BMS factor-evidence repair pipeline

The public lifecycle endpoint now fails closed. A company is publishable only
when all of the following are true:

- all four release factors have sourced previous/current evidence;
- those factors represent 100% of model weight;
- Earnings, Economics, Execution and Balance Sheet are all complete;
- a numerical zero is never used as proof that a factor was observed.

Companies that fail remain in the monitored universe and are counted in the
repair queue, but are absent from the public `companies` array.

All four factors are compulsory for BMS V1.1 publication. Management Delivery
remains available as a separate experimental research overlay, but it does not
affect this release's score, ranking, lifecycle or publication decision.

## Evidence input contract

The research workflow should emit one CSV row per comparable measurement:

```text
symbol,factor,metric_name,previous_period,current_period,previous_value,current_value,unit,source_type,source_ref,source_date,cutoff_date,confidence
```

Accepted source types are company filings/results/presentations/transcripts,
NSE or BSE filings, and audited financial statements. `source_date` must not be
later than `cutoff_date`. The importer rejects unknown companies, untrusted
sources, post-cutoff material, unitless or invalid values, and a declared factor that does
not match the deterministic taxonomy.

Execution and balance-sheet evidence should normally contain two comparable
measurements. Management Delivery may be supplied by the separate guidance
ledger once sufficient matured commitments exist; it is not part of the BMS
V1.1 release gate. A promise with no matured outcome is not a failed promise.

Use `stock_intelligence.factor_evidence_importer.import_factor_evidence_csv`
against the isolated quarterly candidate database before recalculating and
publishing the product artifact.

## Bounded official-evidence cohort

The AlphaSynth dossier workflow can emit optional `factorEvidence` rows for
Execution and Balance Sheet while it is reading already-admitted dated official
documents. The extraction is fail-closed: it accepts only explicit numeric
previous/current comparisons, checks the metric against the deterministic BMS
taxonomy, and does not reuse revenue, profit, EBITDA, or margin as Execution.

After running the stop-line cohort against the isolated pilot, export those
rows to the importer contract with:

```text
npm run export:bms-factor-evidence -- \
  --input=/tmp/alphasynth-stop-line-YYYYMMDD \
  --output=/tmp/bms-factor-evidence.csv \
  --cutoff=YYYY-MM-DD
```

The cutoff used for score repair must be the lifecycle freeze date, not a later
confirmation date. Later evidence belongs in the confirmation overlay and must
not rewrite the frozen score. The exporter writes a sibling diagnostics JSON
showing admitted rows and factor coverage by company. Review that file before
importing anything into the candidate database.

## Publication response

`GET /bms/lifecycle/current` returns:

- `companies`: only evidence-qualified companies;
- `monitored_company_count`: the entire monitored universe;
- `excluded_company_count`: companies awaiting evidence repair;
- `repair_queue_summary.missing_factor_counts`: repair workload by factor;
- `factor_analysis` and `publication_eligibility` on every published company.

The underlying frozen history remains unchanged. Evidence repair creates a new
candidate and must pass the publication gate before it can replace the current
product artifact.
