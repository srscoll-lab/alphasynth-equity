# Momentum Radar daily operations

## Schedule and user behaviour

The Cloud Scheduler job `alphasynth-momentum-radar-daily` in project
`my-nse-research-app`, region `us-central1`, is enabled with schedule
`30 19 * * 1-5`, timezone `Asia/Kolkata`: 7:30 pm IST on weekdays.

Users do not need to open the app to start a refresh. Opening or reloading the
app reads the published snapshot; it does not start the market-data build.
Weekday scheduling is not an exchange holiday calendar. Check the actual
`market_data.as_of_date`, not just the execution or generation time.

## Pipeline

Cloud Scheduler uses OAuth with service account
`alphasynth-tracker-scheduler@my-nse-research-app.iam.gserviceaccount.com`
to invoke the Cloud Run job of the same name through the Google Cloud Run API.
The scheduled job runs the deterministic market-data refresh, enrichment and
verification scripts, then publishes `momentum-radar/current.json` in the
configured Cloud Storage bucket. The API reads this snapshot. A bundled copy
is only a fallback and is explicitly labelled by the API.

## Permission repair on 6 October 2026

The scheduled invocation on 5 October returned HTTP 403 / PERMISSION_DENIED.
The scheduler account had no project-level binding and the radar job's IAM
policy contained no invoker binding. The live snapshot still used prices
through 1 October, generated on 2 October.

Granted `roles/run.invoker` to the existing scheduler service account on this
specific Cloud Run job only. No public access or broad project role was added.
A test through Cloud Scheduler returned HTTP 200 and created execution
`alphasynth-momentum-radar-daily-d88fc`.

An HTTP 200 confirms invocation, not completion or publication. Before declaring
the refresh successful, verify execution completion, publication logs, and the
live API's `generated_at`, `market_data.as_of_date` and `runtime_source`.

The test execution completed successfully at `2026-10-06T08:56:13.738564Z`.
The live API then returned `generated_at: 2026-10-06T08:56:06.737Z`,
`market_data.as_of_date: 2026-10-05`, `runtime_source: cloud_daily_snapshot`,
and no refresh warning. The scan contained 2,558 companies, with 872 in the
liquidity-qualified/rankable universe. These counts are snapshot results and
can change as market data changes. The existing scoring formula was unchanged.

## Read-only checks

```powershell
gcloud scheduler jobs describe alphasynth-momentum-radar-daily --project=my-nse-research-app --location=us-central1
gcloud run jobs executions list --job=alphasynth-momentum-radar-daily --project=my-nse-research-app --region=us-central1
```

Live metadata endpoint:
`https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app/api/bms/momentum-radar`

If a refresh fails, preserve the last verified snapshot and investigate the
failure. Do not estimate missing market prices or change the scoring policy to
force publication.
