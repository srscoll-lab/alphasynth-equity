# Capped helper research handoff — 7 October 2026

User authorized one helper for three companies, followed by a usage and completion review before expansion. Targets: TCS, WIPRO, TECHM. All were lifecycle-pending in the current library.

## Resource stop

Start usage: five-hour 64% used, weekly 10% used, paid balance 1508.2971200000. Subsequent check: five-hour 100% used, weekly 16% used, paid balance 1354.8618200000. Observed paid balance reduction: 153.4353 credits. These are account-wide observations, not isolated per-agent billing. Research was stopped on discovering this change. Do not resume or expand automatically.

## Preserved work

- Original Wipro and Tech Mahindra issuer PDFs and extracted text are in `tmp/three-company-history-20261007/`, named by SHA-256. The helper located six current/prior-year quarter releases for each company. March Tech Mahindra quarterly free cash flow requires its separate investor presentation, not the full-year total in its press release.
- TCS direct download returned 403; no complete usable source set confirmed.
- Parent visually inspected page 2 of all six Wipro PDFs. Values below are reported rounded figures, not inferred from growth rates. Final independent accounting-scope and source metadata checks remain necessary before publication.

| Quarter end | Revenue INR bn | Reported PAT INR bn | IT services margin % | Total bookings USD mn | Operating cash flow INR bn |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2024-12-31 | 223.2 | 33.5 | 17.5 | 3514 | 49.3 |
| 2025-03-31 | 225.0 | 35.7 | 17.5 | 3955 | 37.5 |
| 2025-06-30 | 221.3 | 33.3 | 17.3 | 4971 | 41.1 |
| 2025-12-31 | 235.6 | 31.2 | 17.6 | 3335 | 42.6 |
| 2026-03-31 | 242.4 | 35.0 | 17.3 | 3455 | 31.7 |
| 2026-06-30 | 244.8 | 33.6 | 16.0 | 3370 | 32.9 |

The June2026 margin narrative states a 1.2-point YoY decline, while the independently rounded release values imply 1.3 points; record and reconcile before final admission. June operating cash flow growth of 3.6% is QoQ, not YoY. PAT must remain reported, not labour-code-adjusted. Total bookings must not be replaced by large deal bookings.

## Local validation tooling

`scripts/replay-researched-fcs-history.ts` reads at most three researched companies, checks original local archive hashes, publication cutoffs, numeric values and page locators, and replays the existing scorer/history gate. It does not publish. Matching a hash does not establish semantic correctness; source review is still required.

`scripts/verify-researched-fcs-history.ts` reproduces the existing HCL REBOUNDING result from original archives and verifies rejection of null values, altered hashes, post-cutoff documents, missing pages, wrong periods and duplicate quarters. Passed, along with TypeScript compilation.

No new lifecycle report was published and no deployment was made in this capped helper run. Live coverage remains 19 lifecycle-ready / 39 pending among 58. Next step after an explicit resume: inspect helper's saved report/manifest, independently validate the gathered rows, then integrate only qualifying evidence. Do not repeat source searches already completed.
