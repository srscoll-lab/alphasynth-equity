$ErrorActionPreference = 'Stop'
$fcsCloudCli = 'C:/Users/admin/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
# Credentials are kept in memory and are never printed or written to files.
$fcsWorkerConfig = (& $fcsCloudCli run services describe fcs-review-worker --project=my-nse-research-app --region=us-central1 --format=json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect worker configuration.' }
$fcsTokenEntry = $fcsWorkerConfig.spec.template.spec.containers[0].env | Where-Object { $_.name -eq 'FUNDAMENTAL_REVIEW_INTERNAL_TOKEN' }
$fcsSharedToken = $fcsTokenEntry.value
if (-not $fcsSharedToken -and $fcsTokenEntry.valueFrom.secretKeyRef) {
  $fcsSecretVersion = [string]$fcsTokenEntry.valueFrom.secretKeyRef.key
  $fcsSecretName = [string]$fcsTokenEntry.valueFrom.secretKeyRef.name
  $fcsSharedToken = (& $fcsCloudCli secrets versions access $fcsSecretVersion "--secret=$fcsSecretName" --project=my-nse-research-app)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to access the configured worker authentication secret.' }
}
if (-not $fcsSharedToken) { throw 'Configured worker authentication was unavailable; no smoke requests made.' }
$fcsIdentityToken = (& $fcsCloudCli auth print-identity-token)
if ($LASTEXITCODE -ne 0) { throw 'Unable to obtain an identity token.' }
$fcsHeaders = @{ Authorization = "Bearer $fcsIdentityToken"; 'x-fundamental-review-token' = $fcsSharedToken }
$fcsScorerUrl = 'https://fcs-review-scorer-oqc2y4ogda-uc.a.run.app'
$fcsHealth = Invoke-RestMethod -Uri "$fcsScorerUrl/health" -Headers $fcsHeaders -TimeoutSec 30
if ($fcsHealth.status -ne 'ok') { throw 'Scorer health check failed.' }
$fcsCapabilities = Invoke-RestMethod -Uri "$($fcsWorkerConfig.status.url)/api/bms/fundamental-review/capabilities" -Headers $fcsHeaders -TimeoutSec 30
if ($fcsCapabilities.lifecycleRequiresComparableCheckpoints -ne 3) { throw 'Worker capabilities check failed.' }
$fcsBundle = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../data/fundamental-review-approved-five-company-v2.json') -Raw | ConvertFrom-Json
foreach ($fcsSmokeSymbol in @('HINDALCO', 'LT')) {
  # Replay the existing local archived bundle, never invoke research endpoints.
  # No /request, /execute, Firestore writes or Vertex AI research are invoked.
  $fcsScoreRequest = @{ symbol = $fcsSmokeSymbol; candidates = $fcsBundle.candidates; documents = $fcsBundle.documents; validations = $fcsBundle.validations } | ConvertTo-Json -Depth 60
  $fcsScore = Invoke-RestMethod -Uri "$fcsScorerUrl/score" -Method Post -Headers $fcsHeaders -ContentType 'application/json' -Body $fcsScoreRequest -TimeoutSec 60
  $fcsExpectedRaw = if ($fcsSmokeSymbol -eq 'HINDALCO') { -0.351 } else { 1.0022 }
  $fcsExpectedDisplay = if ($fcsSmokeSymbol -eq 'HINDALCO') { 41 } else { 75 }
  if (-not $fcsScore.score_publishable -or $fcsScore.raw_score -ne $fcsExpectedRaw -or $fcsScore.fcs_score -ne $fcsExpectedDisplay) { throw "Score parity failed for $fcsSmokeSymbol." }
  @{ symbol = $fcsSmokeSymbol; raw_score = $fcsScore.raw_score; fcs = $fcsScore.fcs_score; approved_source = $true; live_research = $false; jobs_created = 0 } | ConvertTo-Json -Compress
}
Write-Output 'Private cloud archived-evidence/scorer smoke test passed; no new FCS jobs or model calls.'
