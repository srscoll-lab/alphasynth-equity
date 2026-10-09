import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const response=await fetch('https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app/api/bms/fundamental-review/result/INFY',{signal:AbortSignal.timeout(30000)});
assert.equal(response.status,200);
const payload:any=await response.json();
assert.equal(payload.informationCutoff,'2026-10-06');
assert.equal(payload.job.status,'ready');
assert.equal(payload.result.score_publishable,true);
assert.equal(payload.result.lifecycle_ready,true);
assert.equal(payload.result.lifecycle,'BUILDING');
assert.deepEqual(payload.result.checkpoints.map((item:any)=>item.periodEnd),['2025-12-31','2026-03-31','2026-06-30']);
assert.deepEqual(payload.result.checkpoints.map((item:any)=>item.fcsScore),[52,55,63]);
assert.equal(new Set(payload.result.checkpoints.map((item:any)=>item.comparabilityKey)).size,1);
const base=path.join(process.cwd(),'data','official-quarter-cache');
const manifest=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8'));
const uniqueSources=new Set<string>();
for (const checkpoint of payload.result.checkpoints) {
 assert.equal(checkpoint.completeFactors,4);
 assert.equal(checkpoint.evidenceReferences.length,4);
 assert.equal(checkpoint.documentReferences.length,2);
 for (const document of checkpoint.documentReferences) {
   assert.equal(document.documentId,`doc-${document.sha256}`);
   assert.ok(document.archiveUri.startsWith('gs://'));
   assert.ok(document.publishedAt.slice(0,10) <= payload.informationCutoff);
   assert.ok(manifest.documents.some((entry:any)=>entry.sha256===document.sha256 && entry.source_url===document.sourceUrl));
   const bytes=await readFile(path.join(base,document.sha256+'.pdf'));
   assert.equal(createHash('sha256').update(bytes).digest('hex'),document.sha256);
   uniqueSources.add(document.documentId);
 }
}
assert.equal(uniqueSources.size,6);
console.log(JSON.stringify({symbol:'INFY',published:true,quarters:3,factors_per_quarter:4,original_hashed_pdf_sources:6,lifecycle:payload.result.lifecycle,latest_period:'2026-06-30'}));
