# BMS Factor Report Contract

**Schema version:** 1.0.0
**Methodology:** BMS V1 (unchanged and frozen)

This contract adds report-level explainability to the existing deterministic BMS output. It does not change factor definitions, weights, scoring, evidence rules, lifecycle thresholds, or historical classifications.

## Required factor record

Each of the five factors carries:

- its frozen BMS V1 weight;
- previous and current reporting periods;
- previous and current factor scores;
- the underlying metrics used at each measurement, including units;
- factor-score change;
- weighted contribution to the current BMS score;
- weighted contribution to the BMS change, when a stored previous factor score exists;
- a concise evidence-bound explanation;
- dated evidence references;
- availability and confidence labels.

The five factors remain Earnings (25%), Economics (25%), Execution (25%), Balance Sheet (15%), and Management Delivery (10%).

## Historical integrity rules

1. Missing measurements are `null`, never zero.
2. Previous measurements must come from the stored historical BMS record.
3. A frozen record must not be reconstructed with information published after its signal date.
4. AI may explain supplied measurements but cannot calculate or change scores.
5. The report must disclose partial or unavailable comparisons.

## Public shortlist eligibility

The ranked Signal Tracker fails closed. A company is published only when at
least four factors contain sourced, comparable previous/current observations,
including the mandatory Earnings and Economics factors, and those completed
factors represent at least 75% of model weight. A stored factor score, including
a zero, is not evidence by itself. Records below the threshold remain in the
internal repair universe and expose neither a composite score nor a lifecycle
rank on the public frontend.

Run `npm run audit:bms-publication -- --base-url=URL` after an ingestion cycle.
The audit writes an eligible set and a private repair queue containing the
missing factors for each rejected company. Repeating the audit never weakens the
gate: newly retrieved evidence can admit a company, while failed retrieval or
incomplete comparisons keep its score unpublished.

## Migration

Legacy lifecycle responses are normalized automatically. The live research-context bridge adds genuine previous/current driver measurements and current weighted-score contributions. Previous factor-score changes remain unavailable until the BMS service exposes its stored historical factor snapshots; these fields stay `null` rather than being reconstructed. The BMS engine can populate the full `factor_analysis` object prospectively without breaking older clients.
