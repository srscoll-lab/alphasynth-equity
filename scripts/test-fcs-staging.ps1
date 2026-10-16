param(
  [string]$Symbol = 'SOLARINDS',
  [string]$CompanyName = 'Solar Industries India Limited',
  [string]$Sector = 'Industrials',
  [string]$Revision = 'alphasynth-equity-fcsnormalizeb1015',
  [string]$Cutoff = '2026-10-15',
  [string]$BaseUrl = 'https://fcs-staging---alphasynth-equity-oqc2y4ogda-uc.a.run.app'
)
$ErrorActionPreference = 'Stop'
$g = 'C:/Users/admin/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
$config = (& $g run revisions describe $Revision --project=my-nse-research-app --region=us-central1 --format=json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read staging revision.' }
$entry = $config.spec.containers[0].env | Where-Object name -eq 'DOSSIER_INTERNAL_TOKEN'
$secret = $entry.value
if (-not $secret -and $entry.valueFrom.secretKeyRef) {
  $secret = & $g secrets versions access $entry.valueFrom.secretKeyRef.key "--secret=$($entry.valueFrom.secretKeyRef.name)" --project=my-nse-research-app
  if ($LASTEXITCODE -ne 0) { throw 'Unable to access staging credential.' }
}
if (-not $secret) { throw 'Missing staging credential.' }
$headers = @{ 'x-dossier-token' = $secret }
$request = @{
  ticker=$Symbol; company_name=$CompanyName; sector=$Sector
  information_cutoff=$Cutoff
  missing_factor_ids=@('earnings','economics','execution','balance_sheet')
}
$provider = Invoke-RestMethod "$BaseUrl/internal/fundamental-review/provider-candidates" -Method Post -Headers $headers -ContentType 'application/json' -Body ($request | ConvertTo-Json -Depth 10) -TimeoutSec 90
$request.provider_financial_candidates = @($provider.candidates)
Write-Output "$Symbol provider comparisons: $($request.provider_financial_candidates.Count)"
$watch = [Diagnostics.Stopwatch]::StartNew()
$result = Invoke-RestMethod "$BaseUrl/api/bms/factor-evidence/research" -Method Post -Headers $headers -ContentType 'application/json' -Body ($request | ConvertTo-Json -Depth 20) -TimeoutSec 1200
$outputDir = Join-Path $PSScriptRoot "../output/fcs-staging-$($Cutoff.Replace('-',''))/$Revision"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$result | Add-Member -NotePropertyName stagingTest -NotePropertyValue @{revision=$Revision; elapsedSeconds=[Math]::Round($watch.Elapsed.TotalSeconds); observedAt=$stamp}
$result | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath (Join-Path $outputDir "$Symbol-$stamp.json") -Encoding utf8
$provider | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath (Join-Path $outputDir "$Symbol-$stamp-provider.json") -Encoding utf8
[pscustomobject]@{
  symbol=$Symbol; elapsedSeconds=[Math]::Round($watch.Elapsed.TotalSeconds)
  rowCount=@($result.rows).Count; factors=@($result.rows.factor | Sort-Object -Unique)
  diagnostics=@($result.diagnostics | Where-Object { $_.outcome -match 'extraction|unit|period|mismatch|summary|failed' })
} | ConvertTo-Json -Depth 14
