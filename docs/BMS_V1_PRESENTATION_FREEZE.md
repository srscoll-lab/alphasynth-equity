# AlphaSynth BMS V1 presentation freeze

## Freeze declaration

AlphaSynth BMS V1 is frozen for the peer-presentation build as of 16 September 2026.
The frozen application source is commit `3e8fa235a188fdb6d82aa231a80c25ffe4a93cf8`
on `codex/server-dossier-pdf`. The immutable Git tag is
`bms-v1-presentation-freeze-2026-09-16`.

This freeze closes core methodology and interface development. Subsequent work may:

- attach newly verified evidence to monitored companies;
- move companies through the existing deterministic publication gate;
- correct a demonstrated defect; or
- update presentation and training material.

It must not silently change factor weights, lifecycle rules, the frozen BMS records,
or publication thresholds.

## Publication policy

A company is shown on the public Signal Tracker only when all of the following hold:

- at least four of the five BMS factors have sourced previous/current evidence;
- comparable evidence represents at least 75% of model weight;
- Earnings and Economics are both complete; and
- the evidence contains usable source references and confidence.

Missing evidence is not interpreted as neutral evidence and does not receive a zero
score. A company that fails the policy remains monitored internally but is excluded
from the public shortlist.

## Frozen acceptance result

The integrated AlphaSynth pilot returned:

| Measure | Result |
| --- | ---: |
| Monitored companies | 477 |
| Published companies | 1 |
| Excluded pending repair | 476 |
| Published symbol | BAJFINANCE |
| Complete factors | Earnings, Economics, Execution, Balance Sheet |
| Missing factor | Management Delivery |
| Complete-factor count | 4 of 5 |
| Covered model weight | 90% |
| Publication status | Eligible |

The machine-readable acceptance record is stored in
`docs/bms-v1-presentation-acceptance.json`.

## Evidence attachment

The launch evidence attached to BAJFINANCE is stored in:

`services/bms-api/src/stock_intelligence/bms_launch_factor_evidence.csv`

SHA-256:

`E3D1D77D468C8DE89764842A25EA76FD0E1AF792A7D5EB1E9509287159EFC40D`

It contains official, dated Q3 FY25 to Q3 FY26 comparisons from the company investor
presentation. This evidence supports the frozen score; it does not recalculate or
rewrite that score.

## Frozen services

- AlphaSynth presentation pilot:
  `https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app`
- BMS evidence-gate pilot:
  `https://bms-evidence-pilot---bms-api-oqc2y4ogda-uc.a.run.app`
- BMS pilot revision: `bms-api-evidencegate3`

Both are isolated tagged revisions. This freeze does not authorize transferring pilot
traffic to production.

## Presentation interpretation

BAJFINANCE has a current BMS level of 58 but is classified as Fading because its BMS
fell by 11 points from the prior result. The interface therefore presents the lifecycle
direction as the primary message and the above-neutral current level as secondary
context.

The frozen result proves the fail-closed workflow. It is not a claim that all 477
companies currently have publication-ready evidence coverage.

## Reproduction check

```bash
curl -sS \
  https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app/api/bms/lifecycle \
| jq '{
  publishedCompanies: .company_count,
  monitoredCompanies: .monitored_company_count,
  excludedPendingRepair: .excluded_company_count,
  publishedSymbols: [.companies[].symbol],
  eligibility: [.companies[] | {symbol, publication_eligibility}]
}'
```

