# Phase A cohort: one current-quarter FCS request per company, sequentially,
# on the isolated alphasynth-fcs-claude-test service only. A failure for one
# company is recorded and the run continues. No worker job, Firestore write or
# publication; beta, main, the worker and n8n are not called.
param([string]$Cutoff = '2026-10-21')
$ErrorActionPreference = 'Stop'
$cohort = @(
  @{ Symbol = 'HAL';       Name = 'Hindustan Aeronautics Limited';  Sector = 'Capital Goods' },
  @{ Symbol = 'EICHERMOT'; Name = 'Eicher Motors Limited';          Sector = 'Automobile and Auto Components' },
  @{ Symbol = 'KPITTECH';  Name = 'KPIT Technologies Limited';      Sector = 'Information Technology' },
  @{ Symbol = 'GLENMARK';  Name = 'Glenmark Pharmaceuticals Limited'; Sector = 'Healthcare' },
  @{ Symbol = 'MARICO';    Name = 'Marico Limited';                 Sector = 'Fast Moving Consumer Goods' },
  @{ Symbol = 'HAVELLS';   Name = 'Havells India Limited';          Sector = 'Consumer Durables' },
  @{ Symbol = 'SRF';       Name = 'SRF Limited';                    Sector = 'Chemicals' },
  @{ Symbol = 'KEC';       Name = 'KEC International Limited';      Sector = 'Construction' },
  @{ Symbol = 'SANSERA';   Name = 'Sansera Engineering Limited';    Sector = 'Automobile and Auto Components' },
  @{ Symbol = 'CPPLUS';    Name = 'Aditya Infotech Limited';        Sector = 'Capital Goods' }
)
$runner = Join-Path $PSScriptRoot 'test-claude-fcs-mixed-source.ps1'
$outputDir = Join-Path $PSScriptRoot "../output/claude-fcs-test-$($Cutoff.Replace('-',''))"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$log = Join-Path $outputDir 'cohort-phase-a.jsonl'
foreach ($company in $cohort) {
  $started = [DateTime]::UtcNow
  try {
    $text = (& $runner -Symbol $company.Symbol -CompanyName $company.Name -Sector $company.Sector -Cutoff $Cutoff) | Out-String
    $result = $text | ConvertFrom-Json
    $line = @{ symbol = $company.Symbol; ok = $true; started = $started.ToString('o'); result = $result }
  } catch {
    $line = @{ symbol = $company.Symbol; ok = $false; started = $started.ToString('o'); error = $_.Exception.Message }
  }
  ($line | ConvertTo-Json -Depth 20 -Compress) | Add-Content -LiteralPath $log -Encoding utf8
  $summary = if ($line.ok) { "publishable=$($line.result.score_publishable) fcs=$($line.result.fcs_score) missing=$(@($line.result.missing_factors) -join ',') seconds=$($line.result.evidenceSeconds)" } else { "ERROR $($line.error)" }
  Write-Output "$($company.Symbol): $summary"
}
Write-Output "cohort log: $log"
