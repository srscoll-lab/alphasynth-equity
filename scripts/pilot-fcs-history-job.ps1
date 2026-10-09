param([switch]$Start, [switch]$Compact, [ValidateSet('INFY','LT','HCLTECH','TCS','WIPRO','TECHM','PERSISTENT','COFORGE','INDIGO')][string]$Symbol='INFY', [ValidatePattern('^2026-10-(0[6789]|10)$')][string]$Cutoff='2026-10-09')
$ErrorActionPreference = 'Stop'
$fcsCli = 'C:/Users/admin/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
$fcsConfig = (& $fcsCli run services describe fcs-review-worker --project=my-nse-research-app --region=us-central1 --format=json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw 'Worker inspection failed.' }
$fcsEntry = $fcsConfig.spec.template.spec.containers[0].env | Where-Object name -eq 'FUNDAMENTAL_REVIEW_INTERNAL_TOKEN'
$fcsToken = $fcsEntry.value
if (-not $fcsToken) {
  $fcsToken = (& $fcsCli secrets versions access $fcsEntry.valueFrom.secretKeyRef.key "--secret=$($fcsEntry.valueFrom.secretKeyRef.name)" --project=my-nse-research-app)
  if ($LASTEXITCODE -ne 0) { throw 'Private authentication unavailable.' }
}
$fcsIdentity = (& $fcsCli auth print-identity-token)
if ($LASTEXITCODE -ne 0 -or -not $fcsToken) { throw 'Private authentication unavailable.' }
$fcsHeaders = @{ Authorization = "Bearer $fcsIdentity"; 'x-fundamental-review-token' = $fcsToken }
if ($Start) {
  if (($fcsConfig.spec.template.spec.containers[0].env | Where-Object name -eq 'FUNDAMENTAL_REVIEW_HISTORY_BACKFILL_ENABLED').value -ne 'true') { throw 'History gate is not enabled; no job started.' }
  $fcsName = @{ INFY='Infosys Limited'; LT='Larsen & Toubro Limited'; HCLTECH='HCL Technologies Limited'; TCS='Tata Consultancy Services Limited'; WIPRO='Wipro Limited'; TECHM='Tech Mahindra Limited'; PERSISTENT='Persistent Systems Limited'; COFORGE='Coforge Limited'; INDIGO='InterGlobe Aviation Limited' }[$Symbol]
  $fcsInput = @{ symbol=$Symbol; company_name=$fcsName; information_cutoff=$Cutoff } | ConvertTo-Json
  $fcsResponse = Invoke-RestMethod -Uri "$($fcsConfig.status.url)/internal/fundamental-review/request" -Method Post -Headers $fcsHeaders -ContentType application/json -Body $fcsInput -TimeoutSec 45
} else {
  try { $fcsResponse = Invoke-RestMethod -Uri "$($fcsConfig.status.url)/internal/fundamental-review/status?symbol=$Symbol" -Headers $fcsHeaders -TimeoutSec 45 }
  catch { $fcsHttpCode=[int]$_.Exception.Response.StatusCode; if ($fcsHttpCode -eq 404) { @{symbol=$Symbol;status='not_requested'} | ConvertTo-Json -Compress; exit 0 }; @{symbol=$Symbol;status='status_lookup_unavailable';http_status=$fcsHttpCode} | ConvertTo-Json -Compress; exit 1 }
}
$fcsJob = $fcsResponse.job
$fcsDiagnostics=$fcsJob.diagnostics
if($Compact){$fcsDiagnostics=@($fcsDiagnostics|Where-Object {$_.outcome -notin @('http_error','PDF_downloaded','pdf_text_chars','document_retrieved','firecrawl_original_pdf_retrieved','retrieval_limit','cached_original_issuer_identity')})}
@{ symbol=$fcsJob.symbol; job_id=$fcsJob.jobId; status=$fcsJob.status; factors=$fcsJob.completedFactors;
  information_cutoff=$fcsJob.informationCutoff; result_available=$fcsJob.resultAvailable;
  checkpoints=@($fcsJob.checkpointHistory | ForEach-Object { @{ period=$_.periodEnd; fcs=$_.fcsScore; raw=$_.rawScore } });
  lifecycle=$fcsJob.scoreResult.lifecycle; lifecycle_ready=$fcsJob.scoreResult.lifecycle_ready;
  current_period=$fcsJob.scoreResult.current_period; diagnostics=$fcsDiagnostics } | ConvertTo-Json -Depth 12 -Compress
