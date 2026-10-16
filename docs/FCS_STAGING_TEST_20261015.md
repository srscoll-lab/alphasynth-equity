# FCS staging acceptance — 15 October 2026

## Release decision

Not ready to promote. Solar Industries produced one verified factor (Execution), not four. No score or lifecycle published by this test. No other companies tested, to preserve the user's remaining included allowance.

## Deployment

- Staging URL: https://fcs-staging---alphasynth-equity-oqc2y4ogda-uc.a.run.app
- Source revision: alphasynth-equity-fcsnormalize1015.
- Current staging revision: alphasynth-equity-fcsnormalizeb1015 (same image, timeout 900 seconds).
- Both deployed with --no-traffic; expectation-pilot tag and normal traffic not changed.
- The service template now has timeout 900 seconds; future deployments inherit this unless explicitly overridden.
- Live n8n and worker routes still use their existing evidence deployment. This test directly called the protected staging provider and research endpoints, not the durable job/report flow.

## Observed results

First attempt: Cloud Run terminated at its original 300-second limit (HTTP 504). Second attempt: 231 seconds, six model candidates, one admitted row.

Tapetide supplied four quarterly candidate comparisons. Official retrieval returned six documents, 69,921 text characters, from 31 source references.

- Earnings: two candidates; source_values_not_verified. Revenue candidate current value 3888.2 requires examination against the original table; earlier official structured cross-check was 3668.2. Never override this conflict by relaxing validation.
- Economics: malformed JSON twice; both finish_reason MAX_TOKENS, despite 6144/8192 output limits. Investigate the thinking/output budget and restrict extraction context before another paid retry.
- Execution: order_book admitted, 21300 to 21350, March to June 2026. This still needs scorer/comparison-basis acceptance and does not establish full-report readiness.
- Balance Sheet: net_worth and debt_to_equity candidates rejected by source_values_not_verified. Inspect exact text, row/column association, period headers and numeric matching to distinguish extraction error from a validation defect.

Detailed non-secret result: output/fcs-staging-20261015/SOLARINDS.json. Reusable runner: scripts/test-fcs-staging.ps1 (live provider/model calls; credentials remain in memory).

## Next work

1. Inspect the archived source table and validation failures; correct shared table handling, never hardcode Solar values.
2. Bound model reasoning/output use with the supported Gemini configuration and preserve finish reasons.
3. Prefer verified structured exchange facts for financial rows. Keep source identity, unit, period, accounting basis and publication date explicit; do not treat annual balance sheets as quarterly observations.
4. Repeat Solar only after an evidenced correction, then test bank, IT, manufacturing and healthcare cases without reviewed company-specific shortcuts.
5. If four factors qualify, test canonicalization, scoring, durable request/status/report navigation and lifecycle separately. Align n8n (720 seconds), worker evidence request (540 seconds), and Cloud Run timeouts with measured runtime.

Local request/status, runtime, canonical evidence and dynamic evidence contract tests passed. Earlier normalization/extraction tests, TypeScript and build passed. These are not proof of cross-industry live reliability.

Usage at the last check: five-hour window 92% used, weekly 14% used, paid credits 698.6163815 unchanged. Stop further development until user resumes with available allowance.
