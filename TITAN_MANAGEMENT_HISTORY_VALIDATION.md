# TITAN Management History Validation

## Decision

The historical management-delivery method is technically workable, but the result must remain an overlay rather than a retrospective rewrite of the BMS V1 lifecycle.

This validation is explicitly labelled `reconstructed_today`. It is an offline test fixture and is not written to the live management-guidance ledger in Google Cloud Storage.

## Acceptance test

The test required at least three distinct, dated and measurable commitments, each matched to a later official outcome. Four commitments passed that admission test:

| Commitment stated on 5 November 2024 | FY25 outcome published on 8 May 2025 | Result |
|---|---|---|
| Jewellery EBIT margin revised to 11%-11.5% | Consolidated jewellery EBIT margin was 9.7% | Missed |
| Watches and Wearables EBIT margin committed at 13%-14% | FY25 margin was 12.1% | Missed |
| Mia expected to reach 250 stores by fiscal year-end | 232 domestic plus 2 international stores | Missed |
| CaratLane expected to add 20 stores from a base of 301 before March | FY25 ended at 322 stores, an increase of 21 | Delivered |

The earlier 11.5%-12.5% jewellery-margin range and its November reduction to 11%-11.5% share one stable commitment key, so the scorer correctly collapses the repetition rather than awarding double weight.

## Scorer result

The existing scorer returns:

- Management delivery score: **45.8 / 100**
- Band: **mixed delivery**
- Evidence confidence: **low**
- Matured delivery component: **25.0 / 100** (one delivered, three missed)
- Revision discipline: **93.3 / 100**
- Disclosure quality: **96.3 / 100**

The composite score is higher than the raw delivery rate because the published methodology separately rewards timely guidance revision and clear, measurable disclosure. That distinction should be visible to users; otherwise the 45.8 score could look too generous beside three misses.

## Honest limitation

This is proof that the architecture can generate a score when sufficient historical evidence exists. It is not proof that every company will have enough official history. The `low` confidence label is correct because there are only four scorable commitments and one revision-discipline observation. Live reports should remain unavailable when the minimum evidence gate is not met.

## Official sources

- [Titan Q1 FY25 earnings call transcript](https://www.titancompany.in/sites/default/files/2024-08/Q1FY25%20Earnings%20Call%20Transcript_1.pdf)
- [Titan Q2 FY25 earnings call transcript](https://www.titancompany.in/sites/default/files/2024-11/Q2FY25%20-%20Earnings%20call%20transcripts_Final%20uploaded.pdf)
- [Titan Q4 FY25 earnings presentation](https://www.titancompany.in/sites/default/files/2025-05/Q4FY25%20-%20Earnings%20presentation%20Uploaded_0.pdf)
- [Titan FY25 results release](https://www.titancompany.in/sites/default/files/2025-05/SEoutcome%2520-%2520Copy.pdf)

## Product implication

Keep the lifecycle label as the recorded BMS V1 output. Present management history as a separate qualifier:

> BMS lifecycle as of [date] | Management delivery: mixed (45.8/100, low confidence) | Quality-gate status

Only a future, explicitly versioned BMS V2 should use this qualifier to prune or rerank lifecycle shortlists, after a prospective multi-company validation demonstrates that the overlay is stable and useful.
