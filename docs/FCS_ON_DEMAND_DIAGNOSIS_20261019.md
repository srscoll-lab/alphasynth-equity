# On-demand FCS: verified failure and repair state (19 October 2026)

## Live Solar Industries request

The public gateway accepted job `solarinds-c3cc3c7f-cdaa-4cee-a0b4-68168f932491` on 15 October. Cloud Run logs show both provider-candidate and official-document research calls returned HTTP 200; n8n orchestration was reached. The worker finished `incomplete`, with zero of four factors admitted. This is not an inactive-n8n failure.

The worker had one instance and concurrency one. Its 193-second execution blocked status reads, causing HTTP 429 and 30-second gateway timeouts. On 19 October the worker was updated to concurrency four and maximum two instances; revision `fcs-review-worker-00026-gg9` serves all worker traffic. The Cloud Tasks queue remains limited to one concurrent execution. This repairs status capacity; it does not create missing financial evidence.

The stored job diagnostics show four `MODEL_JSON_INVALID` factor responses, six retrieved original documents, and direct candidate rejections for period and unit mismatches. The general model extraction retry and bounded thinking budget in the local source are therefore relevant.

## Isolated canary after the first local fixes

Zero-traffic revision `alphasynth-equity-fcsfix1019` was tested directly at a 15 October cutoff. The provider supplied four navigation hints. Structured model extraction completed for all four factors and produced seven candidates. Only one earnings row (PAT) passed the source checks. Five other candidate values could not be matched to the cited originals; an EBITDA candidate was rejected because the model reported the bare denomination `Cr`. No report or lifecycle was generated. The trace is under `output/fcs-staging-20261015/alphasynth-equity-fcsfix1019/` and is excluded from Cloud Run source packages.

The canary also exposed four `structured_filing_issuer_mismatch` diagnostics. Inspection of an [original NSE iXBRL filing](https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_INDAS_186457_13082026161339_iXBRL_WEB.html) showed its identity field rendered as `NSE Symbol | SOLARINDS |`; the matcher expected whitespace without table separators. Local changes now preserve rows without injecting breaks inside cells and accept that exact NSE identity layout. The corresponding isolated deployment stalled twice during source upload before Cloud Build started and was stopped. These latest fixes have **not** passed a live canary or reached beta.

The cited [BSE presentation](https://www.bseindia.com/xml-data/corpfiling/AttachHis/fdc843e7-8b8f-4c0b-ab89-ee0d5aa5f020.pdf) prints `Net Sales` and `EBIDTA` with `Rs. In Cr`; local source-label and unit handling now recognizes those forms while requiring source-value checks. A second BSE filing's extracted ratio table is OCR-corrupted, so its balance-sheet candidates cannot simply be admitted. The NSE quarter table has readable earnings data but does not by itself establish a verified four-factor comparison.

## Release gate

1. Deploy the current local fixes to a new zero-traffic revision when source upload works, then rerun one capped canary and inspect every admitted row against the original table.
2. If any factor remains missing, obtain an original document with the exact current and prior period, unit, accounting basis and metric. Do not fill the gap from Tapetide hints or model inference. An unreadable original needs better extraction or review.
3. Submit the four admitted, same-period factors to the deterministic scorer and confirm a publishable result. Separately check three comparable checkpoints before showing lifecycle readiness.
4. Only then promote the evidence revision and label the request path accordingly. A provider lead or an accepted request is not evidence preflight success. Do not advertise a general on-demand success rate from this one canary.

The generic pipeline now has clear stages: Cloud Tasks and worker dispatch, n8n provider and official-source research, model candidate extraction, deterministic source admission, deterministic FCS scoring, and historical lifecycle checks. The unresolved gate is complete, comparable source evidence across all four factors for each requested company.
