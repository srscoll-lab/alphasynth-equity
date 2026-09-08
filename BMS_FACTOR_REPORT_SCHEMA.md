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
- weighted contribution to the BMS change;
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

## Migration

Legacy lifecycle responses are normalized automatically. Their current factor scores are exposed, while unavailable previous measurements, changes, contributions, explanations, and evidence remain explicitly unavailable. The BMS engine can populate the full `factor_analysis` object prospectively without breaking older clients.
