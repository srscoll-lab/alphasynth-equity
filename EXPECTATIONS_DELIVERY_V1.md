# Expectations–Delivery Overlay V1

## Purpose

This overlay refines research priority inside each frozen BMS lifecycle. It does not alter BMS V1, its factor weights, its score or its lifecycle classification.

## Sequence

1. Preserve the frozen BMS lifecycle.
2. Apply hard and soft quality gates using dated evidence.
3. Freeze management guidance, internal baselines and sector-relative valuation before the outcome.
4. Record the subsequently reported actual values.
5. Calculate delivery surprise deterministically.
6. Assign an expectations–delivery classification.

## Quality policy

- A failed hard gate excludes the company from the refined shortlist without deleting it from the tracker.
- An unknown hard gate produces `insufficient_evidence`, not a pass.
- Soft failures produce a `watch` status and remain visible.
- Gate definitions and thresholds must be sector appropriate.

Initial hard-gate families are cash conversion, leverage/coverage, promoter pledge, auditor integrity and material governance events. Initial soft-warning families are receivables/inventory deterioration, concentration, incremental return on capital, acquisition dependence and management delivery history.

## Expectations

V1 does not require paid analyst consensus. It accepts:

- dated management guidance;
- a documented internal baseline;
- valuation-implied expectations based on the company's own history and sector peers;
- analyst consensus only when licensed point-in-time data later becomes available.

The expectation level is derived from a sector-appropriate valuation percentile:

- 0–35: low expectations;
- above 35 and below 65: balanced;
- 65–100: high expectations.

This is not a universal P/E rule.

## Delivery

Each metric stores its expected value, actual value, direction, tolerance, weight, source type and dated evidence. Surprise is capped at one positive or negative unit per metric so that one outlier cannot dominate the assessment. At least 60% of configured metric weight must be available.

## Classification

| Expectations | Delivery ahead | Delivery behind |
|---|---|---|
| Low | Under-recognised delivery | Turnaround unconfirmed |
| High | Expectations confirmed | De-rating risk |

Balanced expectations produce `delivery_ahead`, `balanced` or `delivery_behind`. Failed quality gates produce `not_eligible`. Incomplete evidence produces `insufficient_evidence`.

## Historical and forward records

Historical records built later must be labelled `reconstructed_today`. Only expectations frozen before the outcome may be labelled `prospective`. Missing data remains unknown and is never represented as zero.

## Automation boundary

n8n and the research model may collect, extract and cite candidate observations. The deterministic application code validates inputs and calculates the final quality, delivery and gap classifications. A language model cannot override a hard gate or assign the final category.
