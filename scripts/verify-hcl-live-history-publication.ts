import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app';
const response=await fetch(base+'/api/bms/fundamental-review/result/HCLTECH',{signal:AbortSignal.timeout(30_000)});assert.equal(response.status,200);
const payload:any=await response.json();assert.equal(payload.job.status,'ready');assert.equal(payload.informationCutoff,'2026-10-07');
assert.equal(payload.result.score_publishable,true);assert.equal(payload.result.lifecycle_ready,true);assert.equal(payload.result.lifecycle,'REBOUNDING');
assert.deepEqual(payload.result.checkpoints.map((item:any)=>item.periodEnd),['2025-12-31','2026-03-31','2026-06-30']);
assert.deepEqual(payload.result.checkpoints.map((item:any)=>item.fcsScore),[66,44,72]);assert.equal(new Set(payload.result.checkpoints.map((item:any)=>item.comparabilityKey)).size,1);
const manifest=JSON.parse(await readFile('data/official-quarter-cache/manifest.json','utf8'));const sources=new Set();
for(const checkpoint of payload.result.checkpoints) {
 assert.equal(checkpoint.completeFactors,4);assert.equal(checkpoint.evidenceReferences.length,4);assert.equal(checkpoint.documentReferences.length,2);
 for(const reference of checkpoint.evidenceReferences){assert.ok(reference.previousLocator.page);assert.ok(reference.currentLocator.page);}
 for(const document of checkpoint.documentReferences) {
  assert.equal(document.documentId,'doc-'+document.sha256);assert.ok(document.archiveUri.startsWith('gs://'));assert.ok(document.publishedAt.slice(0,10)<=payload.informationCutoff);
  assert.ok(manifest.documents.some((entry:any)=>entry.sha256===document.sha256 && entry.source_url===document.sourceUrl));
  assert.equal(createHash('sha256').update(await readFile('data/official-quarter-cache/'+document.sha256+'.pdf')).digest('hex'),document.sha256);sources.add(document.sha256);
 }
}
assert.equal(sources.size,6);
console.log(JSON.stringify({symbol:'HCLTECH',published:true,latest_fcs:72,lifecycle:'REBOUNDING',quarters:3,original_pdf_sources:6,source_pages_verified:true,one_additional_lifecycle_company:true}));
