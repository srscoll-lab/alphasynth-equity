# FCS evidence preflight contract

The preflight is a conservative permission gate for a new FCS worker request. It is not an FCS score and does not assert that a company is attractive.

## Public endpoint

- `GET /api/bms/fundamental-review/preflight` returns the current 100-company priority batch and summary.
- `GET /api/bms/fundamental-review/preflight?symbol=HCLTECH` returns one company's deterministic status.
- Responses are cacheable for five minutes.

## Status and frontend action

| Status | `requestEnabled` | Action |
| --- | ---: | --- |
| `report_ready` | false | Open the already-published FCS; do not rerun paid processing. |
| `high_probability` | true | Show a green **Request FCS** action, with the normal publication caveat. |
| `partial` | false | Explain that evidence verification is incomplete; offer Deep Dive. |
| `unavailable` | false | No preflight conclusion; offer Deep Dive. |

## Promotion rule

`high_probability` is allowed only when one persisted approval proves all of the following:

1. A current official document and a comparable official document have direct HTTPS URLs.
2. Both documents were successfully read, have explicit publication dates, and were published on or before the evidence cutoff.
3. Evidence for all four families was detected: `earnings`, `economics`, `execution`, and `balance_sheet`.

Large-cap membership only changes scan priority. It never enables a request. A report may still fail the stricter FCS publication contract after preflight.

Validated approvals belong in `src/data/fcsPreflightEvidenceApprovals.json`. Empty or incomplete approvals cannot enable a request.

## Capped scan plan

`npm run plan:fcs-preflight-scan -- --limit=25` is deliberately dry-run only. It lists the next partial companies and the maximum projected calls without contacting Firecrawl, Gemini, or issuer websites. For 25 companies the current ceiling is 25 discovery/index calls, 100 candidate-document fetches, and zero model calls.

An executing collector must be separately reviewed. It must enforce the same limit, persist source URLs/dates/readability, and must never promote a company based only on search snippets, company size, or an assumed availability of large-cap disclosures.

The reviewed collector is `scripts/collect-fcs-preflight-approvals.ts`. It remains dry-run unless both `--execute` and an explicit `--limit` from 1–25 are supplied:

```powershell
$env:FIRECRAWL_API_KEY = "<secret>"
npm run collect:fcs-preflight -- --execute --limit=5 --cutoff=2026-10-09
```

An optional `--symbols=ABB,ADANIPORTS` further narrows the selection but never raises the limit. The hard ceiling per company is three Firecrawl searches, four Firecrawl PDF fallback scrapes, forty direct HTTPS requests and zero model calls. Thus a maximum 25-company run is bounded to 175 Firecrawl provider calls, 1,000 direct HTTPS requests and zero Gemini calls.

Successful approvals are written through a validated temporary file with the previous ledger retained as `fcsPreflightEvidenceApprovals.json.bak`. Failed or partial companies are never persisted. After execution, the generated snapshot is rebuilt in a fresh process so newly approved records can become `high_probability`.
