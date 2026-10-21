# Shilpa Medicare: why no FCS was generated

Staging test on 17 October 2026; information cutoff 16 October 2026. This is a **diagnostic**, not an FCS report. The production app was not changed.

## What the pipeline found

| Step | Observed result | Meaning |
| --- | --- | --- |
| Provider comparison | Four candidate comparisons returned | Leads for research, **not** publication-ready values |
| Filing retrieval | Six original documents retrieved; 65,979 text characters | The main failure was **not** a complete absence of documents |
| Model extraction | Six candidate factor rows | Candidate numbers still require unit, period, basis and source-value checks |
| Verification | Two rows admitted, both for EBITDA under **economics** | Only **one of four factor families** has admitted evidence |
| FCS / lifecycle | Neither generated | Four factors are mandatory; lifecycle also needs three comparable, dated checkpoints |

## The actual figures and their status

| Factor | Figure in the staging trace | Status and reason |
| --- | --- | --- |
| Earnings | Revenue: Q1 FY26 **₹328 crore** → Q1 FY27 **₹469 crore**, consolidated, extracted from a [BSE issuer filing](https://www.bseindia.com/xml-data/corpfiling/AttachHis/fab43b0e-31f7-4565-8197-60d8aa5dba4a.pdf) | **Rejected by the deployed staging revision:** the model wrote `INR cr`, which its exact unit registry did not recognize. This is a formatting gate, **not** a finding that the numbers are wrong. No later source-value admission is established for this row. |
| Earnings | Adjusted PAT before exceptional items: **₹47 crore** → **₹101 crore**, same claimed periods/source | **Rejected for the same `INR cr` reason.** The exact metric definition and table association still need checking after the unit fix. |
| Economics | EBITDA: **₹98 crore** → **₹139 crore** (Q1 FY26 to Q1 FY27), and **₹121 crore** → **₹139 crore** (Q4 FY26 to Q1 FY27), consolidated, same [BSE filing](https://www.bseindia.com/xml-data/corpfiling/AttachHis/fab43b0e-31f7-4565-8197-60d8aa5dba4a.pdf) | **Admitted** by the staging evidence checks. These are two comparisons of one metric, not two independent factor families. They still need a human spot-check before any user-facing claim. |
| Execution | “Segment revenue” **₹328 crore** → **₹469 crore**, and **₹439 crore** → **₹469 crore**, from the same consolidated highlights | **Rejected for `INR cr`.** More importantly, the quoted label was *Total Revenue*, so relabeling it “segment revenue” may be incorrect. This requires a table/metric-definition check, not just a unit fix. |
| Balance sheet | **No candidate** returned | No verified debt, cash-flow, working-capital or similar comparison entered this factor. The Q1 [NSE iXBRL filing](https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_INDAS_182581_05082026144822_iXBRL_WEB.html) leaves its debt/equity field blank; an appropriate half-yearly or annual filing must be located for balance-sheet evidence. |

## Why the sources cannot simply be combined

The provider returned “Sales” **321 → 466** for June 2025 to June 2026, with `provider_reported_scale` and `candidate_only` status. The model extracted consolidated revenue **328 → 469** from a BSE filing. Those are *not the same printed values*, so the provider comparison cannot silently substitute for the filing figures. It may reflect a scope, definition, version or rounding difference; that has **not** been resolved.

The NSE [Q1 FY27](https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_INDAS_182581_05082026144822_iXBRL_WEB.html) and [Q1 FY26](https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_INDAS_111074_13082025183233_iXBRL_WEB.html) iXBRL pages are **standalone**, not consolidated. Q1 FY27 revenue from operations is **18,904 lakh = ₹189.04 crore**; Q1 FY26 is **₹92.4331 crore** from INR actuals. These figures can support a *standalone-to-standalone* comparison, but must not be mixed with the BSE consolidated comparison above. The different unit scales are explicit in the two NSE pages.

## Exact point of failure

The data journey reached document retrieval and model extraction. At the **evidence admission** step, four candidate rows stopped at a unit alias (`INR cr`), while the balance-sheet extractor produced no candidate. The initial earnings model response also needed a retry after malformed JSON at its output limit. A general `INR cr` alias has since been added **locally** and its focused test passes; it was **not** part of this staging run and has not been proven to admit the rejected rows. Even if it does, metric association and balance-sheet coverage remain unresolved.

The most useful manual checks are: (1) open the BSE consolidated filing and confirm the exact revenue, adjusted PAT, EBITDA and segment labels/columns; (2) find an original, comparable half-yearly or annual balance-sheet/cash-flow filing; (3) decide whether this review should use consolidated or standalone evidence and apply that choice consistently; and (4) only then retest the scorer. No partial FCS should be published.

## Equivalence-layer correction and retest

The local normalizer is now registry-driven rather than dependent on a few exact strings. It recognizes the observed crore/million/billion spellings and symbols and safely converts explicit INR actuals, lakh, million, crore, thousand-crore and billion scales while preserving the printed source values. An offline replay recovered **8 of 8** unit-only rejections across the five-company trial, including all four Shilpa unit rejections.

The first corrected staging retest then found a further NSE presentation convention: the prior filing says `INR (in Actuals)`, while the current iXBRL declares `presentation currency: INR` separately from `amount in Lakhs`; the extracted row therefore said only `Lakhs`. A second local correction now accepts a bare scale only when the paired period is explicitly INR-denominated **and** the cited original confirms both INR and that scale. Bare `Lakhs` without that source context remains rejected. Its tests pass.

That staging retest produced two structured standalone earnings candidates—revenue from operations and total income—but zero economics, execution, or balance-sheet candidates. Therefore terminology is no longer the conceptual blocker; complete four-factor coverage remains unavailable from those Q1 structured filings alone. A subsequent zero-traffic deployment attempt for the split INR/scale correction stalled before revision creation and was cancelled; the beta app was not changed. The second correction still requires a successful staging deployment and retest.
