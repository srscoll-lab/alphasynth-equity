# On-demand FCS beta — deploy and rollback plan (for owner approval)

Prepared 23 Oct 2026 from a read-only check. Nothing here has been run.

## What changes, what does not
| Service | Today | After | Who sees it |
|---|---|---|---|
| `fcs-review-worker` | revision `fcs-review-worker-00026-gg9` (19 Oct, old evidence route) | new revision from the Claude copy | Only the beta. Main has no FCS settings. |
| `alphasynth-equity` beta tag `expectation-pilot` | `alphasynth-equity-ui1016` | new revision from the Claude copy, 0% traffic | Beta link only |
| Main (`dossier17`, 100% traffic) | unchanged | unchanged | Everyone |
| `fcs-review-scorer`, n8n | unchanged | unchanged | — |

Code: branch `claude/fcs-mixed-source` at the commit named when approved (today: `3f86820` + handoff).
It contains ChatGPT's latest checkpoint `9d60f0f` (the ChatGPT folder is clean at that commit) plus
the Claude FCS work. The live beta was built on 16 Oct from an older copy of the same code.

## Read-only findings that shape the plan
- The beta calls the worker directly (`/internal/fundamental-review/request`, `/status`), not n8n.
  The beta already has `TAPETIDE_TOKEN`, so large/mid-cap companies on the radar can be requested.
- The worker has no `TAPETIDE_TOKEN`, no archive bucket setting, no `GCP_PROJECT_ID`/`GCP_REGION`
  (needed by the Gemini document reader), and 512 MiB memory (the test service uses 2 GiB).
- Worker service account `fcs-worker@` lacks: Secret Manager access to `TAPETIDE_TOKEN`,
  Vertex AI (Gemini) use, and write access to the archive bucket.
- Task queue `fcs-reviews`: one review at a time (good for the Free plan); up to 3 attempts only
  if the worker crashes. A finished or paused review is never re-run.
- Worker request timeout 900 s. Current evidence normally takes 1–3 min; history is given
  5 min in total (2.5 min per quarter) below.

## Steps (each needs the owner's go-ahead)
**A. Permissions for `fcs-worker@` (reversible)**
```
gcloud secrets add-iam-policy-binding TAPETIDE_TOKEN --project=my-nse-research-app --member=serviceAccount:fcs-worker@my-nse-research-app.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding my-nse-research-app --member=serviceAccount:fcs-worker@my-nse-research-app.iam.gserviceaccount.com --role=roles/aiplatform.user --condition=None
gcloud storage buckets add-iam-policy-binding gs://my-nse-research-app-signal-tracker-470912802345 --member=serviceAccount:fcs-worker@my-nse-research-app.iam.gserviceaccount.com --role=roles/storage.objectCreator
gcloud storage buckets add-iam-policy-binding gs://my-nse-research-app-signal-tracker-470912802345 --member=serviceAccount:fcs-worker@my-nse-research-app.iam.gserviceaccount.com --role=roles/storage.objectViewer
```

**B. Worker: new revision, all worker traffic (worker serves only the beta)**
```
gcloud run deploy fcs-review-worker --source . --project=my-nse-research-app --region=us-central1 --no-allow-unauthenticated --revision-suffix=claudebeta1023 --memory=2Gi --cpu=2 --update-secrets=TAPETIDE_TOKEN=TAPETIDE_TOKEN:latest --update-env-vars=GCP_PROJECT_ID=my-nse-research-app,GCP_REGION=us-central1,FUNDAMENTAL_REVIEW_ARCHIVE_BUCKET=my-nse-research-app-signal-tracker-470912802345,FCS_HISTORY_BUDGET_MS=300000,FCS_HISTORY_REQUEST_MS=150000
```
All existing worker settings (queue, Firestore, scorer, internal tokens, n8n fallback URL) are kept.

**C. Beta: new revision with 0% traffic, then move only the `expectation-pilot` tag**
1. Before deploying, confirm the service template's settings match `ui1016` (a new revision copies
   the template); set any difference explicitly.
2. `gcloud run deploy alphasynth-equity --source . --project=my-nse-research-app --region=us-central1 --no-traffic --tag=fcsbeta1023 --revision-suffix=fcsbeta1023`
3. Open the tag URL, check the radar, a report and the request button.
4. `gcloud run services update-traffic alphasynth-equity --project=my-nse-research-app --region=us-central1 --update-tags=expectation-pilot=alphasynth-equity-fcsbeta1023`
   (main traffic stays 100% on `dossier17`).

**D. One live on-demand check through the beta link** (Free plan, about 8–10 Tapetide calls,
on a day with quota left): request Eicher Motors, wait for FCS + lifecycle, open the report and
check the provider, as-at and "derived" labels. Then check that a bank (e.g. HDFC Bank) is declined
with the "not yet supported" message before any data call.

## Rollback (one command each, about a minute)
```
gcloud run services update-traffic fcs-review-worker --project=my-nse-research-app --region=us-central1 --to-revisions=fcs-review-worker-00026-gg9=100
gcloud run services update-traffic alphasynth-equity --project=my-nse-research-app --region=us-central1 --update-tags=expectation-pilot=alphasynth-equity-ui1016
```
The step A grants can be removed with the matching `remove-iam-policy-binding` commands.

## Known limits testers should be told
- Free data plan: about 15 current-FCS reviews or about 5 full reviews (FCS + lifecycle) per day
  across all users; after that, reviews pause with a plain message until 00:00 IST.
- Lifecycle forms for about half of companies so far (3 of 6 tested); otherwise it shows "pending"
  with the reason. Banks, NBFCs and insurers are not supported yet (59 of 250 large/mid caps).
- Data is labelled "Tapetide / company documents, not cross-verified with NSE/BSE".
- Older worker records in Firestore may have been measured differently; for such a company the
  first new review may show the lifecycle as pending until three like-for-like quarters exist.
