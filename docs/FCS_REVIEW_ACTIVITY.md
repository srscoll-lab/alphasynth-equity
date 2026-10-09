# App-wide FCS request tracking

Implemented on 6 October 2026. The main navigation has a `My FCS reviews`
control on every app page, including independent research and validation.

## Behaviour

- Both the Momentum Radar and the all-company FCS launcher register durable
  job acknowledgements in one shared browser store.
- Existing `alphasynth.fcs.review-jobs.v1` browser data is retained. Requests
  initiated before this change in the radar can be restored on reload.
- The always-mounted navigation control owns background status polling.
  Active jobs refresh every 15 seconds while the app is visible. Returning
  to a visible tab refreshes active jobs; reload checks saved jobs once.
- Completed jobs stop continuous polling. A manual status check remains
  available. Polling errors retain the last known status with an explicit
  warning rather than implying that processing stopped.
- Completion notifications distinguish successful reports from incomplete
  or failed attempts. `incomplete` means the attempt finished without a new
  publishable FCS, not that the company can never be scored.
- Incomplete or failed attempts do not show an Open FCS action for that
  attempt. Previously published static reports are labelled separately.
- Browser storage is device/origin-specific, not account-synchronised.
  There is no email, push notification or offline background processing
  within the browser. The Cloud Run worker itself continues independently.

## Report retrieval

`GET /api/bms/fundamental-review/result/:symbol` uses the existing private
status gateway. It returns only permitted score-result fields when the
worker record has four validated factors, a supported ready state and an
explicitly publishable finite FCS. Other outcomes return HTTP 409, not a
fabricated report. No scoring formula or evidence threshold changed.

## Verification

`scripts/verify-fundamental-review-activity.ts` checks browser persistence,
request deduplication, old-response protection, failed status retrieval,
terminal polling, active polling and safe result publication. The existing
contract tests, TypeScript check and production build pass. Browser checks
confirm the tracker remains present in company research and fits a
390-pixel phone viewport.

Deployment is isolated from unrelated local PDF edits. Main-app traffic
remains untouched; the release targets the `expectation-pilot` beta tag.

## Live release

Revision `alphasynth-equity-fcsactivity1006` was deployed to the beta tag on
6 October 2026 with zero main-service traffic. Main traffic remains 100% on
`alphasynth-equity-dossier17`. The app's live research page displays the
app-wide activity control. The existing Adani Ports attempt still reports
`incomplete`, 0/4 validated factors, and no result. Its result endpoint
returns HTTP 409 with the outcome explanation. The live radar still reads
the cloud snapshot with market data through 5 October.

No new production evidence job was started during these checks. Successful
result rendering and transitions use local contract/store tests; a newly
completed real review was not generated as part of this UI release.

The first source upload encountered a network reset. It was stopped before
building, and the retry excluded the unneeded legacy Google SDK archive
from the deployment copy. The original workspace archive was not deleted.
