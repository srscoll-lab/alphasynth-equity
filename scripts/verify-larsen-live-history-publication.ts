import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const response=await fetch('https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app/api/bms/fundamental-review/result/LT',{signal:AbortSignal.timeout(30_000)});
assert.equal(response.status,200);
const payload:any=await response.json();
assert.equal(payload.job.status,'ready');
assert.equal(payload.informationCutoff,'2026-10-07');
assert.equal(payload.result.score_publishable,true);
assert.equal(payload.result.lifecycle_ready,true);
assert.equal(payload.result.lifecycle,'FADING');
assert.deepEqual(payload.result.checkpoints.map((item:any)=>item.periodEnd),['2025-12-31','2026-03-31','2026-06-30']);
assert.deepEqual(payload.result.checkpoints.map((item:any)=>item.fcsScore),[83,65,53]);
assert.equal(new Set(payload.result.checkpoints.map((item:any)=>item.comparabilityKey)).size,1);
const manifest=JSON.parse(await readFile('data/official-quarter-cache/manifest.json','utf8'));
const sources=new Set();
for(const checkpoint of payload.result.checkpoints) {
 assert.equal(checkpoint.completeFactors,4);
 assert.equal(checkpoint.evidenceReferences.length,4);
 assert.equal(checkpoint.documentReferences.length,1);
 for(const reference of checkpoint.evidenceReferences) {
   assert.equal(reference.previousDocumentId,reference.currentDocumentId,'Both explicit values come from one quarterly table');
   assert.equal(reference.currentLocator.page,checkpoint.periodEnd==='2026-06-30'?7:5);
 }
 for(const document of checkpoint.documentReferences) {
   assert.equal(document.documentId,'doc-'+document.sha256);
   assert.ok(document.archiveUri.startsWith('gs://'));
   assert.ok(document.publishedAt.slice(0,10)<=payload.informationCutoff);
   assert.ok(manifest.documents.some((entry:any)=>entry.sha256===document.sha256 && entry.source_url===document.sourceUrl));
   const bytes=await readFile('data/official-quarter-cache/'+document.sha256+'.pdf');
   assert.equal(createHash('sha256').update(bytes).digest('hex'),document.sha256);
   sources.add(document.sha256);
 }
}
assert.equal(sources.size,3);
console.log(JSON.stringify({symbol:'LT',published:true,lifecycle:'FADING',quarters:3,original_pdf_sources:3,pdf_page_locators_preserved:true}));
