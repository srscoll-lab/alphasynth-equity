# Beta proof run on the isolated alphasynth-fcs-claude-test service only:
# per company, the current-quarter FCS, then (if published) its two earlier
# quarters and the lifecycle check. Stops cleanly when Tapetide reports its
# plan limit. Beta, main, the worker and n8n are not called.
param([string]$Cutoff = (Get-Date).ToString('yyyy-MM-dd'))
$ErrorActionPreference = 'Stop'
$companies = @(
  @{ Symbol = 'EICHERMOT'; Name = 'Eicher Motors Limited';           Sector = 'Automobile and Auto Components' },
  @{ Symbol = 'MARICO';    Name = 'Marico Limited';                  Sector = 'Fast Moving Consumer Goods' },
  @{ Symbol = 'HAVELLS';   Name = 'Havells India Limited';           Sector = 'Consumer Durables' },
  @{ Symbol = 'KPITTECH';  Name = 'KPIT Technologies Limited';       Sector = 'Information Technology' },
  @{ Symbol = 'GLENMARK';  Name = 'Glenmark Pharmaceuticals Limited'; Sector = 'Healthcare' },
  @{ Symbol = 'HAL';       Name = 'Hindustan Aeronautics Limited';   Sector = 'Capital Goods' }
)
$here = $PSScriptRoot
$outputDir = Join-Path $here "../output/claude-fcs-test-$($Cutoff.Replace('-',''))"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$log = Join-Path $outputDir 'beta-proof.log'
function Note([string]$line) { Write-Output $line; Add-Content -LiteralPath $log -Value $line -Encoding utf8 }
function QuotaHit([string]$pattern) {
  $file = Get-ChildItem $outputDir -Filter $pattern | Sort-Object Name | Select-Object -Last 1
  return $file -and ((Get-Content $file.FullName -Raw) -match 'tapetide_quota_exhausted')
}
function Usage([string]$pattern) {
  $file = Get-ChildItem $outputDir -Filter $pattern | Sort-Object Name | Select-Object -Last 1
  if (-not $file) { return '?' }
  $u = ((Get-Content $file.FullName -Raw) | ConvertFrom-Json).diagnostics | Where-Object { $_.outcome -eq 'tapetide_usage' } | Select-Object -Last 1
  if ($u) { return "$($u.network_calls) calls, $($u.cache_hits) cached" } else { return '?' }
}
Note "=== Beta proof run, cutoff $Cutoff, started $([DateTime]::UtcNow.ToString('o'))"
foreach ($c in $companies) {
  try {
    $current = (& "$here/test-claude-fcs-mixed-source.ps1" -Symbol $c.Symbol -CompanyName $c.Name -Sector $c.Sector -Cutoff $Cutoff | Out-String) | ConvertFrom-Json
    Note "$($c.Symbol) current: publishable=$($current.score_publishable) fcs=$($current.fcs_score) missing=$(@($current.missing_factors) -join ',') | Tapetide $(Usage "$($c.Symbol)-20*-evidence.json")"
    if (QuotaHit "$($c.Symbol)-20*-evidence.json") { Note "STOP: Tapetide plan limit reached during $($c.Symbol)."; break }
    if (-not $current.score_publishable) { continue }
    $history = & "$here/test-claude-fcs-history.ps1" -Symbol $c.Symbol -CompanyName $c.Name -Sector $c.Sector -Cutoff $Cutoff | Out-String
    $quota = (QuotaHit "$($c.Symbol)-history-2026-03-31-*-evidence.json") -or (QuotaHit "$($c.Symbol)-history-2025-12-31-*-evidence.json")
    $assessment = (& node --experimental-strip-types "$here/assess-claude-fcs-history.ts" $c.Symbol $Cutoff 2>&1 | Out-String)
    $life = ($assessment -split "`n" | Where-Object { $_ -match 'LIFECYCLE' }) -join ' '
    Note "$($c.Symbol) history: $(($history -split "`n" | Where-Object { $_ -match '"publishable"|"fcs"|"missing"' } | ForEach-Object { $_.Trim() }) -join ' ') | $life"
    if ($quota) { Note "STOP: Tapetide plan limit reached during $($c.Symbol) history."; break }
  } catch {
    Note "$($c.Symbol) ERROR: $($_.Exception.Message)"
  }
}
Note "=== finished $([DateTime]::UtcNow.ToString('o'))"
