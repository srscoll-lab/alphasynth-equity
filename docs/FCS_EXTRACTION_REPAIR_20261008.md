# FCS extraction repair after usage reset

Starting usage: five-hour 100% remaining, weekly 56%; paid balance 1284.6903115000. On-demand repair only; no cohort expansion.

Diagnostic revision extractionaudit1008 and job indigo-1941a480-011b-49f2-87d2-6ae155ded63d established five candidates were produced. Revenue/PAT were incorrectly converted from printed INR million to crore; EBITDAR was incorrectly named EBITDA. All failed validation, no report. The earlier missing candidate detail is now included in bounded rejection snapshots.

Changes:
- Extract only from retrieved original text when available; omit conflicting search prose/legacy numeric anchors from the extraction input. Explicit raw-unit and EBITDAR/EBITDA instructions.
- Exact registered canonical metrics precede legacy substring guesses. This fixes PAT margin being mapped to Earnings and sales_volume being renamed to an unregistered alias.
- Match accounting parentheses as negative values and explicit abbreviated quarterly month/year headers. Exact word boundaries prevent EBITDA matching EBITDAR.
- Explicit airline passenger_load_factor registry entry, with documented metric review in the scorer repository. It uses the existing utilization policy (importance75, percentage-point magnitude, higher direction). Existing scoring weights and formulas unchanged. No company values hard-coded.

Tests: canonical mapping for every registered metric, legacy descriptive mapping, negative-number/date matching, TypeScript, scorer and lifecycle-worker validation tests all pass. Scorer includes wrong-unit rejection for the new metric; existing consolidation/period/provenance/cutoff failure tests pass.

Private scorer deployed as fcs-review-scorer-airlinemetric1008. Beta rawextraction1008 deployment in progress at this note. Only two scorer config files copied to the existing clean scorer stage. App stage updated server, source-match helper, canonical mapper and metric registry. User PDF edits excluded. No worker redeploy required: worker canonicalization accepts metric IDs and the private scorer validates the registry. No GitHub push.

## Live result and stopping point

Beta rawextraction1008 deployment completed. Normal job indigo-52d3671a-e4d7-424f-82ec-e9c825703d1c completed incomplete with ONE accepted factor (Earnings), two admitted comparisons (revenue and PAT), no report or lifecycle. Raw million-unit values now validate. Three candidates were returned, all Earnings; net_total_income correctly failed the label check because total income is not net total income. Requested factors included all four, so remaining omission is the combined extraction step.

Implemented LOCAL, NOT DEPLOYED: fcs-factor-extraction.ts runs a maximum of four factor-specific calls, two concurrent, schema restricted to each factor and its registered metric IDs, maximum two rows per factor, safe independent failure diagnostics. The existing downstream validators still apply. Wrapper tests pass. server.ts uses this wrapper and preserves original-document-only extraction. No further live job started. Before deploying, confirm final TypeScript result; then copy server.ts and src/fcs-factor-extraction.ts to hcl-app stage, deploy beta only, and run one normal INDIGO acceptance request. Check remaining usage first. At stop decision: 10% five-hour /42% weekly remaining, paid balance unchanged at1284.6903115000. Avoid consuming that reserve.

The new airline metric is already deployed in the private scorer and beta's extraction registry. No existing company score was recomputed. No success-rate claim is supported yet. A complete four-factor report and three-period lifecycle still require live acceptance. The current job is terminal, no work is left running.
