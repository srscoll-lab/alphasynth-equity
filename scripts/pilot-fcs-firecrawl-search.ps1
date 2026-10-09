param([string]$Query='site:goindigo.in InterGlobe Aviation quarterly results June 2026 investor presentation pdf',[string]$PdfUrl)
$ErrorActionPreference='Stop'
$fcsCli='C:/Users/admin/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd'
$fcsConfig=(& $fcsCli run services describe alphasynth-equity --project=my-nse-research-app --region=us-central1 --format=json)|ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'Service inspection failed'}
$fcsEntry=$fcsConfig.spec.template.spec.containers[0].env|Where-Object name -eq 'FIRECRAWL_API_KEY'
$fcsKey=$fcsEntry.value
if(-not $fcsKey -and $fcsEntry.valueFrom.secretKeyRef){
  $fcsKey=(& $fcsCli secrets versions access $fcsEntry.valueFrom.secretKeyRef.key "--secret=$($fcsEntry.valueFrom.secretKeyRef.name)" --project=my-nse-research-app)
  if($LASTEXITCODE -ne 0){throw 'Provider configuration unavailable'}
}
if(-not $fcsKey){throw 'Provider configuration unavailable'}
$fcsEndpoint='search'
$fcsBody=@{query=$Query;limit=8;sources=@('web');timeout=30000}|ConvertTo-Json
if($PdfUrl){
  $fcsUri=[uri]$PdfUrl
  if($fcsUri.Scheme -ne 'https' -or $fcsUri.Host -ne 'www.goindigo.in' -or -not $fcsUri.AbsolutePath.EndsWith('.pdf')){throw 'Expected an official IndiGo PDF'}
  $fcsEndpoint='scrape'
  $fcsBody=@{url=$PdfUrl;formats=@('rawBase64');parsers=@();timeout=30000}|ConvertTo-Json
}
try {
  $fcsResponse=Invoke-RestMethod -Uri "https://api.firecrawl.dev/v2/$fcsEndpoint" -Method Post -Headers @{Authorization="Bearer $fcsKey"} -ContentType application/json -Body $fcsBody -TimeoutSec 45
} catch {throw "Search failed with HTTP status $([int]$_.Exception.Response.StatusCode)"}
if($PdfUrl){
  if(-not $fcsResponse.data.rawBase64){throw 'Original bytes not returned'}
  $fcsBytes=[Convert]::FromBase64String($fcsResponse.data.rawBase64)
  $fcsHash=[System.Security.Cryptography.SHA256]::Create()
  @{success=$fcsResponse.success;bytes=$fcsBytes.Length;sha256=([BitConverter]::ToString($fcsHash.ComputeHash($fcsBytes))).Replace('-','').ToLower();metadata=$fcsResponse.data.metadata;signature=[System.Text.Encoding]::ASCII.GetString($fcsBytes,0,5)}|ConvertTo-Json -Depth 5
}else{
  @{success=$fcsResponse.success;results=@($fcsResponse.data.web|ForEach-Object {@{url=$_.url;title=$_.title;description=$_.description}})}|ConvertTo-Json -Depth 5
}
