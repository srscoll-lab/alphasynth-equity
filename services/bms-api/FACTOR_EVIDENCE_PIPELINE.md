# BMS factor-evidence repair pipeline

The public lifecycle endpoint now fails closed. A company is publishable only
when all of the following are true:

- at least four of the five factors have sourced previous/current evidence;
- those factors represent at least 75% of model weight;
- Earnings and Economics are both complete;
- a numerical zero is never used as proof that a factor was observed.

Companies that fail remain in the monitored universe and are counted in the
repair queue, but are absent from the public `companies` array.

## Evidence input contract

The research workflow should emit one CSV row per comparable measurement:

```text
symbol,factor,metric_name,previous_period,current_period,previous_value,current_value,source_type,source_ref,source_date,cutoff_date,confidence
```

Accepted source types are company filings/results/presentations/transcripts,
NSE or BSE filings, and audited financial statements. `source_date` must not be
later than `cutoff_date`. The importer rejects unknown companies, untrusted
sources, post-cutoff material, invalid values, and a declared factor that does
not match the deterministic taxonomy.

Execution and balance-sheet evidence should normally contain two comparable
measurements. Management Delivery should be supplied as a comparable composite
derived from at least four matured, dated commitments across at least two
reporting periods. A promise with no matured outcome is not a failed promise.

Use `stock_intelligence.factor_evidence_importer.import_factor_evidence_csv`
against the isolated quarterly candidate database before recalculating and
publishing the product artifact.

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
