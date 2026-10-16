# FCS alternate-source trial — 13 October 2026

## Decision summary

Tapetide is useful as a structured **candidate-data and document-discovery layer**, but this ten-company trial does not justify using it as the sole evidence source for publishing an FCS or lifecycle result.

- All 10 companies returned some provider data.
- 7 of 10 passed the trial's minimum provider-data and document-date checks; 3 were incomplete.
- A secondary public table matched all 37 comparable rounded values. This is a useful consistency check, but the exact agreement may reflect common upstream normalization and is not independent proof of accuracy.
- Automated checks against linked exchange-filed PDFs corroborated 3 companies, left 2 for manual review, and could not fairly compare 5 because the filing period was misaligned or the document could not be read within the bounded trial.
- No FCS score, lifecycle classification, preflight approval, or user-facing request state was changed.

The defensible production decision is therefore: **use the alternate source to locate candidate values and filings, then require period-, unit-, and source-aligned verification before those values enter the deterministic FCS pipeline.**

## Controlled cohort

| Company | Why selected | Provider result | Official-file audit |
|---|---|---|---|
| RADICO | Submitted review ended at 0/4 factors | Ready | Manual review; period verified, 1/4 values found near matching labels |
| MARINE | Submitted review ended at 0/4 factors | Ready | Corroborated; period verified, 3/4 values found |
| SIGMAADV | Submitted review ended at 0/4 factors | Ready | Corroborated; period verified, 2/4 values found |
| INDIGO | PDFs were retrieved but extraction remained incomplete | Ready | Manual review; period verified, 1/4 values found |
| ADANIPORTS | User-requested review ended incomplete | Incomplete | Not comparable; linked result document did not match the data period |
| ABB | Existing preflight was partial | Ready | Not comparable; official document retrieval/read failed in this run |
| APOLLOHOSP | Existing preflight was partial | Ready | Not comparable; official document exceeded the bounded reader limit |
| ASIANPAINT | Existing preflight was partial | Ready | Corroborated; period verified, 2/4 values found |
| AXISBANK | Existing preflight was partial; bank-specific statement | Incomplete | Not comparable; document unreadable and generic four-field schema is unsuitable |
| DIVISLAB | Existing preflight was partial | Incomplete | Not comparable; linked result document did not match the data period |

“Corroborated” here means at least two provider values were found near appropriate labels in a same-period exchange-filed document. It is an extraction audit result, not permission to publish an FCS.

## What the test revealed

The alternate source removes much of the discovery burden. It supplied a reporting period, normalized values, and a result-document link for difficult companies. It also exposed the main reason the existing worker often returns 0/4: official filings vary materially in layout, accounting unit, OCR quality, and terminology.

For example, one filing printed figures in lakhs while the provider normalized them to crores, and its extracted PDF text dropped decimal separators. A strict literal matcher therefore misses a value that a human can see. The trial matcher now recognizes common crore/million/lakh scales and limited OCR variants, while deliberately refusing to guess when period or labels are unclear.

Banks and other financial companies need a separate factor vocabulary. Applying industrial-company fields such as revenue, operating profit and operating margin to AXISBANK is methodologically wrong even if a data service returns a profit figure.

## Recommended production design

1. Access the provider through its supported MCP or API, not by scraping its public pages.
2. Request company financials and the list of company documents.
3. Retain the exact reporting period, consolidation basis, unit, publication date, and original exchange/issuer URL with every candidate value.
4. Reject post-cutoff documents and period-misaligned links.
5. Verify candidate values against an exchange/issuer original, preferably structured XBRL when available; otherwise use bounded PDF extraction plus a manual-review state.
6. Route banks/NBFCs, airlines, insurers, and other special statement types through metric-specific adapters.
7. Feed only verified, comparable evidence into the existing deterministic FCS and lifecycle calculation.
8. Do not turn an FCS button green merely because alternate-source data exists. Green should mean the official-source evidence gate passed.
9. Obtain written commercial/licensing permission before using provider data in a public paid product or redistributing it.

## Implementation delivered

- A frozen ten-company cohort and a 30-call ceiling.
- A limited alternate-source collector that stores only four candidate metrics and provenance, not full provider pages.
- A same-period official-document corroboration audit with scale and common OCR handling.
- A secondary public-table consistency audit.
- A pure comparison module with checks for period, unit, publication cutoff, source provenance, and tolerances.
- A verification script covering matching, mismatch, and post-cutoff cases.

The trial used public provider pages for a bounded diagnostic and made no Tapetide MCP calls. A production implementation must move to the supported MCP/API and comply with the provider's terms and call limits.

## Go/no-go conclusion

**Go** for a second engineering phase in which Tapetide is a candidate-data and document-discovery input behind the official-source evidence gate.

**No-go** for replacing official evidence, promising a 90% successful FCS-generation rate, or enabling all FCS buttons based on this trial alone. Before making such a promise, the complete candidate-to-official pipeline should pass a larger frozen sample, including special-sector schemas, with a predeclared success threshold.
