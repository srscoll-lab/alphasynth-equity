# Five-company FCS evidence trial — 17 October 2026

## Scope and selection

The live Momentum Radar snapshot was dated 16 October 2026. Its public publication list and the existing static FCS library were excluded using `scripts/plan-curated-fcs-queue.ts`. The five candidates below span different sectors and are micro/small-cap according to that radar. Company size is only a selection proxy; it does not prove analyst coverage is low.

| Symbol | Company | Radar sector | Size | Official source lead |
| --- | --- | --- | --- | --- |
| CUPID | Cupid Limited | Fast Moving Consumer Goods | Micro cap | https://www.cupidlimited.com/financial-reports/ (Q1 FY27 and Q1 FY26 results listed; current quarter also has a correction notice) |
| CPPLUS | Aditya Infotech Limited | Capital Goods | Small cap | https://www.adityagroup.com/financial-results (Q1 FY27 and Q1 FY26 results listed) |
| SKYGOLD | Sky Gold and Diamonds Limited | Consumer Durables | Micro cap | https://skygold.co.in/investor-relation/ (June 2026 and June 2025 results listed) |
| SANSERA | Sansera Engineering Limited | Automobile and Auto Components | Micro cap | https://sansera.in/financial_reports (Q1 FY27 and Q1 FY26 results listed) |
| SHILPAMED | Shilpa Medicare Limited | Healthcare | Micro cap | NSE Q1 FY27 iXBRL: https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_INDAS_182581_05082026144822_iXBRL_WEB.html ; Q1 FY26: https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_INDAS_111074_13082025183233_iXBRL_WEB.html |

## Stage 1 result: source discovery only

All five have plausible current and comparable original-source paths. This is a positive **discovery** result, not a verified factor or successful FCS report. Source discovery alone invoked no Firecrawl, Gemini, Tapetide, n8n, scoring, publication, or database write. No app request button was changed.

Shilpa demonstrates why source association remains necessary: NSE identifies both Q1 filings as standalone, but Q1 FY27 is presented in INR lakhs and Q1 FY26 in INR actuals. The current iXBRL page includes a revenue figure but has a blank debt/equity field. Any factor derived across those periods requires explicit unit normalization and, if needed, an additional original source. Cupid's Q1 FY27 page lists a subsequent correction notice, so the corrected filing must be resolved before admission.

## Stage 2: isolated Shilpa Medicare canary

One run was made against the protected, zero-traffic `alphasynth-equity-fcsunits1016` staging revision, with a 16 October 2026 cutoff. The existing staging test runner requested provider candidates and factor-evidence research; this is **not** an end-to-end test of the live request button, n8n, worker, scoring, or publication. It took about 187 seconds and invoked external provider/model services; exact service charges were not measured. The trace is saved locally under `output/fcs-staging-20261016/alphasynth-equity-fcsunits1016/SHILPAMED-20261017T051717977Z.json`.

The provider returned four candidate comparisons. Retrieval obtained six original documents and 34 references, with two oversized documents, two rejected-domain results, and one retrieval-limit result. Extraction yielded six model candidates, but only two rows were admitted; both were **EBITDA in the economics factor** from the same BSE filing, comparing Q1 FY27 with Q1 FY26 and Q4 FY26 respectively. Thus there was no four-factor FCS or lifecycle to publish. The current beta was not changed. Retrieved originals were archived by the staging evidence path.

Four candidates, including revenue, were rejected as `unregistered_metric_unit` because the extractor emitted `INR cr`, which was absent from the exact unit-alias list although the denomination parser recognized it. The first earnings extraction also hit a malformed-JSON/max-output-token retry, and balance-sheet extraction yielded no candidates. A **general, local-only** normalization change now maps `INR cr` to the existing INR-crore unit; its focused test passes. This change has not been deployed or retested against source-value verification, so it is not evidence that the rejected rows would ultimately pass or that FCS can be generated.

The initial stop rule held for the first trial session. The user then explicitly requested the remaining four trials. They were run once each against the **same isolated staging revision and cutoff**; no automatic reruns or live beta publication followed.

## Completed five-company result (same staging revision)

| Company | Provider comparisons | Originals retrieved | Model candidates | Admitted rows | Distinct factors admitted | Full FCS |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Shilpa Medicare | 4 | 6 | 6 | 2 | economics only | No |
| Aditya Infotech | 4 | 6 | 5 | 2 | earnings, economics | No |
| Cupid | 4 | 6 | 7 | 0 | none | No |
| Sansera Engineering | 4 | 6 | 8 | 3 | economics, execution | No |
| Sky Gold and Diamonds | 4 | 6 | 5 | 0 | none | No |

Aditya Infotech admitted revenue and EBITDA-margin comparisons. Two other extracted figures failed source-value verification. Cupid had four filing-date attributions unsupported by document headers, two source-value failures, and one unregistered `₹ Cr` unit. Sansera had two source-value failures and three unregistered units (`INR Mn` / `INR Millions`); some extraction calls needed model-JSON retries. Sky Gold had five filing-date attributions unsupported by document headers, and no balance-sheet candidate. These are per-run staging observations, not a statistical reliability estimate.

The newly observed denomination spellings `₹ Cr`, `INR Mn`, and `INR Millions` have been added to the **local-only** representation normalizer, with a source-text requirement for INR-million units. The focused normalization test passes. None of the local alias changes was present in the staging revision used for the five trials; they have not been deployed or retested end-to-end. A correct alias alone cannot resolve date attribution, absent candidates, wrong table/period association, or source-value mismatches. No FCS or lifecycle report was generated by this trial.

The provider returned comparisons and document retrieval worked in all five cases, but the full four-factor outcome was **0/5**. This shows the current automated pipeline is not ready to promise on-demand FCS for these companies. It does **not** establish that the companies lack data or that the particular provider is unusable: the losses occurred at several extraction and verification steps. Exact external provider/model charges and the user's Codex usage percentage were not available from this environment.

## Remaining test, not yet passed

Before another paid trial, address the common failures: document-header publication-date support; exact table/column/period association for source-value verification; extraction of balance-sheet candidates; bounded model JSON output; and explicit, source-supported unit normalization. Then retest in isolated staging and run deterministic scorer gates before making any request button or report available. Preserve failed traces and never publish a partial score. A lifecycle additionally requires three comparable, dated checkpoints.

The existing `collect-fcs-preflight-approvals.ts` priority batch contains none of these five, so it was **not** executed or repurposed: doing so would not test this cohort and could modify the approval ledger. The staging runner makes external provider/model calls and does not by itself validate the durable n8n/worker publication path.
