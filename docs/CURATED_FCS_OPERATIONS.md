# Curated FCS beta operations

## What the app shows

The Momentum Radar has a small “Featured research examples” shelf. It selects up
to five companies with an already published FCS **and** a three-period lifecycle,
ranks them by the current positive Radar score, and spreads the picks across
sectors and company sizes where possible. If fewer than five qualify, it shows
fewer rather than filling the shelf with pending lifecycle reports. It shows the
Radar snapshot date, FCS evidence date, and latest assessed lifecycle period.
“View FCS” opens that company’s existing report; “Deep Dive” opens its separate
research view. The shelf reselects when the user loads a newer daily Radar
snapshot or the publication list changes. It does not request paid research.

## Preparing two more companies

Use a recent Radar JSON snapshot. The bundled JSON may be old and is rejected
if more than seven days behind the current date. If there are live FCS
publications not yet in the bundled library, save the public publications
response and pass it too, so already published symbols are excluded.

```powershell
node --import tsx scripts/plan-curated-fcs-queue.ts --input=path/to/recent-radar.json --publications=path/to/publications.json --limit=2
```

The same planner can read the two public API endpoints directly with `--url`
and `--publications-url`. Both requests are read-only and use a 15-second
timeout; they do not initiate a review.

This prints candidates only. It makes no network, model, or FCS job calls and
does not publish a report. Confirm each candidate’s company identity, official
current and comparable filings, accounting basis, period and units. Run the
existing four-factor validation and lifecycle admission rules. If a company
cannot pass, record the failure and move to the next candidate. Do not force
two reports to be published every day.

## Ongoing updates

The Momentum Radar has a weekday scheduled refresh. The FCS evidence pipeline
does **not** currently have a proven automatic filing monitor or scheduled
quarterly recomputation. Opening the app refreshes the shelf from available
Radar and publication data; it does not update the underlying FCS.

A safe update workflow is: monitor the official filings of covered companies,
compare each new filing ID and reporting period with the last admitted source,
queue changed companies, collect current and comparable original documents,
validate all four factors, append a new dated checkpoint, then recompute the
lifecycle when three comparable checkpoints exist. Preserve the prior report
and expose an “update pending” date if a fresh filing cannot be verified.
Automating this requires a tested filing discovery feed, bounded retries,
source archival, and an exception queue. Do not schedule automatic publication
until the cross-sector acceptance trial demonstrates reliable results.
