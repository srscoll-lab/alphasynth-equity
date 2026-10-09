param([string]$TargetPeriod = '2026-03-31')
$ErrorActionPreference = 'Stop'
if ($TargetPeriod -notmatch '^2026-(03-31|06-30)$') { throw 'Only the two planned pilot quarters are permitted.' }
$fcsCloudCli = 'C:/Users/admin/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
$fcsConfig = (& $fcsCloudCli run services describe fcs-review-worker --project=my-nse-research-app --region=us-central1 --format=json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect private worker.' }
$fcsSecretEntry = $fcsConfig.spec.template.spec.containers[0].env | Where-Object name -eq 'FUNDAMENTAL_REVIEW_INTERNAL_TOKEN'
$fcsSecret = $fcsSecretEntry.value
if (-not $fcsSecret) {
  $fcsSecretName = [string]$fcsSecretEntry.valueFrom.secretKeyRef.name
  $fcsSecretVersion = [string]$fcsSecretEntry.valueFrom.secretKeyRef.key
  $fcsSecret = (& $fcsCloudCli secrets versions access $fcsSecretVersion "--secret=$fcsSecretName" --project=my-nse-research-app)
  if ($LASTEXITCODE -ne 0) { throw 'Cannot authenticate private pilot.' }
}
$fcsIdentity = (& $fcsCloudCli auth print-identity-token)
if ($LASTEXITCODE -ne 0 -or -not $fcsSecret) { throw 'Private authentication unavailable.' }
$fcsHeaders = @{ Authorization = "Bearer $fcsIdentity"; 'x-fundamental-review-token' = $fcsSecret }
# One direct-document historical request. No retry, public enablement or ledger mutation.
# A client timeout does not guarantee cancellation of upstream model work.
foreach ($fcsSymbol in @('INFY')) {
  $fcsTimer = [Diagnostics.Stopwatch]::StartNew()
  $fcsCompanyName = if ($fcsSymbol -eq 'LT') { 'Larsen & Toubro Limited' } else { 'Infosys Limited' }
  $fcsInput = @{ ticker = $fcsSymbol; company_name = $fcsCompanyName; information_cutoff = '2026-10-06'; target_period_end = $TargetPeriod; missing_factor_ids = @('earnings', 'economics', 'execution', 'balance_sheet') } | ConvertTo-Json
  try {
    $fcsEvidence = Invoke-RestMethod -Uri "$($fcsConfig.status.url)/internal/fundamental-review/evidence" -Method Post -Headers $fcsHeaders -ContentType 'application/json' -Body $fcsInput -TimeoutSec 180
    $fcsCandidates = @($fcsEvidence.candidates | Where-Object { $_.current_period.end_date -eq $TargetPeriod })
    $fcsQualified = @($fcsEvidence.validations | Where-Object { $_.status -in @('qualified', 'qualified_provisional') })
    $fcsSummary = @{ symbol = $fcsSymbol; target_period = $TargetPeriod; candidates = $fcsCandidates.Count; qualified = $fcsQualified.Count; documents = @($fcsEvidence.documents).Count; diagnostics = @($fcsEvidence.diagnostics | Select-Object outcome,metric,reasons); score_publishable = $false }
    if ($fcsCandidates.Count -gt 0) {
      $fcsScoreInput = @{ symbol = $fcsSymbol; information_cutoff = '2026-10-06'; candidates = $fcsCandidates; documents = $fcsEvidence.documents; validations = $fcsEvidence.validations } | ConvertTo-Json -Depth 70
      $fcsScore = Invoke-RestMethod -Uri 'https://fcs-review-scorer-oqc2y4ogda-uc.a.run.app/score' -Method Post -Headers $fcsHeaders -ContentType 'application/json' -Body $fcsScoreInput -TimeoutSec 45
      $fcsSummary.score_publishable = $fcsScore.score_publishable
      $fcsSummary.completed_factors = @($fcsScore.factors).Count
      $fcsSummary.rejected = @($fcsScore.rejected_candidates)
      if ($fcsScore.score_publishable) {
        $fcsEvidence | ConvertTo-Json -Depth 80 | Set-Content -LiteralPath "output/fcs-live-evidence-$fcsSymbol-$TargetPeriod.json" -Encoding UTF8
      }
    }
    $fcsSummary.elapsed_seconds = [Math]::Round($fcsTimer.Elapsed.TotalSeconds)
    $fcsSummary | ConvertTo-Json -Depth 8 -Compress
  } catch {
    # Do not print response bodies, headers, credentials or full exceptions.
    @{ symbol = $fcsSymbol; target_period = $TargetPeriod; outcome = 'request_failed_or_timed_out'; elapsed_seconds = [Math]::Round($fcsTimer.Elapsed.TotalSeconds); score_publishable = $false } | ConvertTo-Json -Compress
  }
}
