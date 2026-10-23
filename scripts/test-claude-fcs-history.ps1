# Capped live test of the three-quarter FCS history on the isolated
# alphasynth-fcs-claude-test service: one evidence request per historical
# quarter, carrying the current score's exact metric definitions (as the
# worker's backfill does), scored by the stateless private scorer. No worker
# job, Firestore write or publication.
param(
  [string]$Symbol = 'SOLARINDS',
  [string]$CompanyName = 'Solar Industries India Limited',
  [string]$Sector = 'Industrials',
  [string]$Cutoff = '2026-10-19',
  [string[]]$Targets = @('2026-03-31', '2025-12-31'),
  [string]$Service = 'alphasynth-fcs-claude-test',
  [string]$ScorerUrl = 'https://fcs-review-scorer-oqc2y4ogda-uc.a.run.app/score'
)
$ErrorActionPreference = 'Stop'
$g = 'C:/Users/admin/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
$project = 'my-nse-research-app'
$outputDir = Join-Path $PSScriptRoot "../output/claude-fcs-test-$($Cutoff.Replace('-',''))"
# Current-quarter results are "<SYMBOL>-2026…-score.json"; never pick a "<SYMBOL>-history-…" file.
$currentScoreFile = Get-ChildItem $outputDir -Filter "$Symbol-20*-score.json" | Sort-Object Name | Select-Object -Last 1
$current = Get-Content $currentScoreFile.FullName -Raw | ConvertFrom-Json
if (-not $current.score_publishable) { throw "Latest current score $($currentScoreFile.Name) is not publishable." }
# Mirrors historyMetricDefinitions(): segment rows are locked by their issuer name.
$definitions = @($current.factors | ForEach-Object { $factor = $_.factor_id; $_.impacts | ForEach-Object {
  $definition = @{ factor = $factor; metric = $_.metric_id; unit = $_.canonical_unit; consolidation_basis = $_.consolidation_basis; comparison_basis = $_.comparison_basis }
  if ($_.metric_id -eq 'segment_revenue') { $definition.source_label = $_.current_source_locator.quoted_label }
  # Same as the worker's historyMetricDefinitions: which printed row the current quarter used.
  if ($factor -eq 'execution') { $definition.label_hint = ([string]$_.current_source_locator.quoted_label -split " $([char]0x2014) ")[0].Trim() }
  $definition } })

$baseUrl = (& $g run services describe $Service --project=$project --region=us-central1 --format='value(status.url)')
$internal = & $g secrets versions access 4 --secret=fcs-internal-token --project=$project
$identity = & $g auth print-identity-token
$headers = @{ Authorization = "Bearer $identity"; 'x-fundamental-review-token' = $internal }

foreach ($target in $Targets) {
  $request = @{ ticker = $Symbol; company_name = $CompanyName; sector = $Sector; information_cutoff = $Cutoff
    target_period_end = $target; required_metric_definitions = $definitions }
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $evidence = Invoke-RestMethod "$baseUrl/internal/fundamental-review/evidence" -Method Post -Headers $headers -ContentType 'application/json' -Body ($request | ConvertTo-Json -Depth 10) -TimeoutSec 900
  $seconds = [Math]::Round($watch.Elapsed.TotalSeconds)
  # Same period rule as the worker: three factors match the quarter; Balance Sheet may be its half-year end.
  $halfYear = if ($target.EndsWith('-06-30')) { "$($target.Substring(0,4))-03-31" } elseif ($target.EndsWith('-12-31')) { "$($target.Substring(0,4))-09-30" } else { $target }
  # Mirrors balanceSheetPeriodAllowed(): quarter end, half-year end, or the latest 31 March on/before it.
  $latestMarch = if ($target.Substring(5) -ge '03-31') { "$($target.Substring(0,4))-03-31" } else { "$([int]$target.Substring(0,4) - 1)-03-31" }
  $aligned = @($evidence.candidates | Where-Object { if ($_.factor_id -eq 'balance_sheet') { $_.current_period.end_date -in @($target, $halfYear, $latestMarch) } else { $_.current_period.end_date -eq $target } })
  $scoreBody = @{ symbol = $Symbol; information_cutoff = $Cutoff; candidates = $aligned; documents = @($evidence.documents); validations = @($evidence.validations) }
  $score = Invoke-RestMethod $ScorerUrl -Method Post -Headers $headers -ContentType 'application/json' -Body ($scoreBody | ConvertTo-Json -Depth 50) -TimeoutSec 60
  $stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
  $evidence | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath (Join-Path $outputDir "$Symbol-history-$target-$stamp-evidence.json") -Encoding utf8
  $score | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath (Join-Path $outputDir "$Symbol-history-$target-$stamp-score.json") -Encoding utf8
  [pscustomobject]@{ target = $target; evidenceSeconds = $seconds
    candidates = @($aligned | ForEach-Object { "$($_.factor_id):$($_.canonical_metric_id) $($_.previous_period.label)->$($_.current_period.label) $($_.previous_canonical_value)->$($_.current_canonical_value)" })
    publishable = $score.score_publishable; fcs = $score.fcs_score; raw = $score.raw_score; missing = $score.missing_factors
    rejected = @($score.rejected_candidates | ForEach-Object { "$($_.candidate_id): $($_.reason)" }) } | ConvertTo-Json -Depth 6
}
