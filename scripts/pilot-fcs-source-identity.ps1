param([string]$SourceUrl='https://www.sebi.gov.in/sebi_data/attachdocs/1445319248511.pdf',[switch]$Scan)
$ErrorActionPreference='Stop'
$fcsCli='C:/Users/admin/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
$fcsConfig=(& $fcsCli run services describe fcs-review-worker --project=my-nse-research-app --region=us-central1 --format=json)|ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'Worker inspection failed'}
$fcsEntry=$fcsConfig.spec.template.spec.containers[0].env|Where-Object name -eq 'FUNDAMENTAL_REVIEW_INTERNAL_TOKEN'
$fcsToken=$fcsEntry.value
if(-not $fcsToken){$fcsToken=(& $fcsCli secrets versions access $fcsEntry.valueFrom.secretKeyRef.key "--secret=$($fcsEntry.valueFrom.secretKeyRef.name)" --project=my-nse-research-app)}
if(-not $fcsToken){throw 'Private authentication unavailable'}
$fcsInput=@{symbol='INDIGO';company_name='InterGlobe Aviation Limited';source_url=$SourceUrl;scan_current_sources=$Scan.IsPresent}|ConvertTo-Json
Invoke-RestMethod -Uri 'https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app/internal/fundamental-review/source-identity' -Method Post -Headers @{'x-fundamental-review-token'=$fcsToken} -ContentType application/json -Body $fcsInput -TimeoutSec 60 | ConvertTo-Json -Depth 7 -Compress
