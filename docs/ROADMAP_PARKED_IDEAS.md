# Parked ideas (agreed with the owner, to pick up later)

## Cross-company FCS screener (agreed 28 Oct 2026)

**When:** once about 50+ companies have current FCS reports. Roughly one to two weeks of daily
Free-plan batches after the multibagger study's data collection ends (early Nov 2026). The owner
asked not to forget this: it is meant for quick shortlisting.

**What it answers (examples):**
- Companies with FCS above 60 and lifecycle Recovering or Building.
- Sectors with the most improving companies this quarter (company-specific vs industry-wide).
- Companies that moved from Watch to Recovering since last quarter.
- Did high scorers go on to outperform? (with price data; belongs with the multibagger study for now)
- Watch-list companies that also have an improving FCS (watch list needs a structured form).

**How (stay in Google; no separate SQL database needed):**
1. **Screener page in the beta.** Filters for FCS range, lifecycle and sector, plus "change since last
   quarter". It reads what already exists: the worker's published-report list
   (`fcsPublicationSummaries`), sector labels in the radar data, and the stored quarterly checkpoints.
   Small piece of work: offline build and tests, then one beta deploy with owner approval.
2. **Later: BigQuery analysis copy** of the review records in the same Google project (free at this
   size; SQL or Looker Studio) to join FCS with the study data, the watch list and returns. The live
   app is unchanged.
3. **Full SQL database** (Cloud SQL or Supabase) only if the live app itself needs complex queries, e.g.
   user accounts with personal watch lists. Advice given 28 Oct: keep Firestore and Cloud Storage for now.
