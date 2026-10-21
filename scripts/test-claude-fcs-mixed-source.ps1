# One capped live test of the mixed-source FCS evidence path:
# Tapetide (Earnings/Economics) + n8n official extraction (Execution/Balance Sheet),
# merged in the isolated alphasynth-fcs-claude-test service, then scored by the
# existing stateless private scorer. No worker job, Firestore write or publication.
param(
  [string]$Symbol = 'SOLARINDS',
  [string]$CompanyName = 'Solar Industries India Limited',
  [string]$Sector = 'Industrials',
  [string]$Cutoff = '2026-10-19',
  [string]$Service = 'alphasynth-fcs-claude-test',
  [string]$ScorerUrl = 'https://fcs-review-scorer-oqc2y4ogda-uc.a.run.app/score'
)
$ErrorActionPreference = 'Stop'
$g = 'C:/Users/admin/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
$project = 'my-nse-research-app'
$baseUrl = (& $g run services describe $Service --project=$project --region=us-central1 --format='value(status.url)')
if (-not $baseUrl) { throw "Test service $Service not found." }
$internal = & $g secrets versions access 4 --secret=fcs-internal-token --project=$project
$identity = & $g auth print-identity-token
if (-not $internal -or -not $identity) { throw 'Missing credentials.' }
$headers = @{ Authorization = "Bearer $identity"; 'x-fundamental-review-token' = $internal }

$request = @{ ticker = $Symbol; company_name = $CompanyName; sector = $Sector; information_cutoff = $Cutoff }
$watch = [Diagnostics.Stopwatch]::StartNew()
$evidence = Invoke-RestMethod "$baseUrl/internal/fundamental-review/evidence" -Method Post -Headers $headers -ContentType 'application/json' -Body ($request | ConvertTo-Json) -TimeoutSec 900
$evidenceSeconds = [Math]::Round($watch.Elapsed.TotalSeconds)

$scoreBody = @{ symbol = $Symbol; information_cutoff = $Cutoff; candidates = @($evidence.candidates); documents = @($evidence.documents); validations = @($evidence.validations) }
$score = Invoke-RestMethod $ScorerUrl -Method Post -Headers $headers -ContentType 'application/json' -Body ($scoreBody | ConvertTo-Json -Depth 50) -TimeoutSec 60

$outputDir = Join-Path $PSScriptRoot "../output/claude-fcs-test-$($Cutoff.Replace('-',''))"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$evidence | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath (Join-Path $outputDir "$Symbol-$stamp-evidence.json") -Encoding utf8
$score | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath (Join-Path $outputDir "$Symbol-$stamp-score.json") -Encoding utf8

[pscustomobject]@{
  symbol = $Symbol; cutoff = $Cutoff; evidenceSeconds = $evidenceSeconds
  candidates = @($evidence.candidates | ForEach-Object { "$($_.factor_id):$($_.canonical_metric_id) $($_.previous_period.label)->$($_.current_period.label) $($_.previous_canonical_value)->$($_.current_canonical_value) [$($_.evidence_source)]" })
  score_publishable = $score.score_publishable; fcs_score = $score.fcs_score; raw_score = $score.raw_score
  publication_lane = $score.publication_lane; missing_factors = $score.missing_factors; reasons = $score.reasons
  rejected = @($score.rejected_candidates | ForEach-Object { "$($_.candidate_id): $($_.reason)" })
  key_diagnostics = @($evidence.diagnostics | Where-Object { $_.outcome -match 'provider|mixed|superseded|tapetide|dynamic|summary|admitted|not_verified|mismatch|failed' } | ForEach-Object { $_.outcome } | Group-Object | ForEach-Object { "$($_.Count)x $($_.Name)" })
  saved = $outputDir
} | ConvertTo-Json -Depth 10
