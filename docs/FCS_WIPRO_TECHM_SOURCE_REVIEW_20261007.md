# Wipro and Tech Mahindra history review — 7 October 2026

Scope: current research library only. The frozen forward-validation cohort is not changed.

## Wipro

Six official issuer PDFs, paired Q3 FY26, Q4 FY26 and Q1 FY27 with the same quarters a year earlier. Quarterly highlights on physical page 2 were visually reviewed. All five metrics are extracted with exact quoted labels and archived byte hashes. Reported PAT is retained; labour-code-adjusted PAT is not substituted. Annual totals and large-deal-only bookings are excluded. IT-services margin uses the issuer-defined segment basis consistently. Rounded raw margins, not a reverse-engineered growth percentage, drive the comparison.

Local deterministic scores: 44 → 28 → 34; lifecycle Recovering through 30 June 2026. Wipro worker job `wipro-3bffad8c-5e83-484b-8c79-c2d23077cffe` was verified ready on the beta, with the same three scores and six GCS-archived originals.

## Tech Mahindra

Six issuer press releases and the Q4 FY26 earnings presentation were downloaded and preserved by SHA-256. Revenue, reported PAT and absolute EBITDA were visually checked in consolidated Ind-AS INR-million tables. EBITDA is not replaced by EBIT or an operating-margin percentage.

| Period end | Revenue INR m | PAT INR m | EBITDA INR m | New deals USD m | Quarterly FCF USD m |
|---|---:|---:|---:|---:|---:|
| 2024-12-31 | 132856 | 9832 | 18090 | 745 | 199 |
| 2025-03-31 | 133840 | 11667 | 18674 | 798 | 150 |
| 2025-06-30 | 133512 | 11406 | 19352 | 809 | 86 |
| 2025-12-31 | 143932 | 11220 | 23656 | 1096 | 194 |
| 2026-03-31 | 150761 | 13538 | 25653 | 1073 | 99 |
| 2026-06-30 | 157119 | 14651 | 27425 | 1078 | 167 |

March 2026 FCF 99 is from the earnings presentation's physical page 11, Q4 FY26 column. The press release's 616 is full-year FCF and is not admitted as a quarterly value. Its publication date is supported by the [22 April 2026 NSE filing](https://nsearchives.nseindia.com/corporate/Apekshakhemka_22042026170513_Investorpresentation_S.pdf), which confirms that the quarterly earnings presentation was submitted with the board outcome on that date.

Local deterministic scores: 75 → 74 → 87; lifecycle Emerging through 30 June 2026. These are not proof of future returns. The reviewed adapter requires exact source URL, SHA-256, publication date and archived original; unsupported future periods or changed documents require a new review rather than inheriting these values.

Both sets use the existing scorer and lifecycle policy unchanged. Regression tests cover cutoff, wrong period/basis, missing values, changed hashes, immutable library merging and frozen-record preservation.

## Verified live publication

Beta revision `alphasynth-equity-historytechm1007` serves the expectation-pilot tag with zero normal traffic. Main-app traffic remains unchanged. Tech Mahindra job `techm-1a4046ae-3ed3-4ea0-b2a6-2d9ee2a08d1a` is ready with four factors, three checkpoints and Emerging lifecycle. `scripts/verify-wipro-techm-live-history.ts` passed against the live public result endpoints, checking both score sequences, consistent checkpoint definitions, source-page locators, cutoff dates, all 13 original hashes and GCS archive references.

Merged current library: **58 four-factor companies / 21 lifecycle-ready / 37 pending**, up from 19 ready at the start of this run. This is two additional lifecycle companies, not completion of the remaining cohort. No GitHub push was performed. Original library snapshots and frozen forward validation were preserved.

Next: identify remaining companies with complete original quarterly sources; use the same bounded source review and replay workflow. TCS originals were previously blocked by HTTP 403; do not repeat generic model jobs as a substitute. Tech Mahindra's reviewed adapter supports only these three current periods and exact originals, not automatic future-quarter extraction. Marketing should describe a beta with partial, dated lifecycle coverage rather than claim full coverage or predictive efficacy.
