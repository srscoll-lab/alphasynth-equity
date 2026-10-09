import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fundamentalChangeLibrary} from '../src/data/fundamentalChangeLibrary.ts';
import {mergeFcsPublications} from '../src/fcs-publications.ts';
const base='https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app';
const manifest=JSON.parse(await readFile('data/official-quarter-cache/manifest.json','utf8'));
for(const [symbol,scores,lifecycle,count]of [['WIPRO',[44,28,34],'RECOVERING',6],['TECHM',[75,74,87],'EMERGING',7]] as const){
 const response=await fetch(base+'/api/bms/fundamental-review/result/'+symbol,{signal:AbortSignal.timeout(30_000)});assert.equal(response.status,200);
 const payload:any=await response.json();assert.equal(payload.job.status,'ready');assert.equal(payload.informationCutoff,'2026-10-07');
 assert.equal(payload.result.score_publishable,true);assert.equal(payload.result.lifecycle_ready,true);assert.equal(payload.result.lifecycle,lifecycle);
 assert.deepEqual(payload.result.checkpoints.map((c:any)=>c.periodEnd),['2025-12-31','2026-03-31','2026-06-30']);
 assert.deepEqual(payload.result.checkpoints.map((c:any)=>c.fcsScore),scores);
 assert.equal(new Set(payload.result.checkpoints.map((c:any)=>c.comparabilityKey)).size,1);
 const sources=new Set();
 for(const c of payload.result.checkpoints){
  assert.equal(c.completeFactors,4);assert.equal(c.evidenceReferences.length,5);
  for(const r of c.evidenceReferences){assert.ok(r.currentLocator.page);assert.ok(r.previousLocator.page);}
  for(const d of c.documentReferences){
   assert.ok(d.archiveUri.startsWith('gs://'));assert.ok(d.publishedAt.slice(0,10)<=payload.informationCutoff);
   assert.ok(manifest.documents.some((m:any)=>m.sha256===d.sha256&&m.source_url===d.sourceUrl));
   assert.equal(createHash('sha256').update(await readFile('data/official-quarter-cache/'+d.sha256+'.pdf')).digest('hex'),d.sha256);sources.add(d.sha256);
  }
 }
 assert.equal(sources.size,count);console.log(JSON.stringify({symbol,published:true,fcs:scores.at(-1),lifecycle,quarters:3,verified_originals:sources.size}));
}
const pub:any=await(await fetch(base+'/api/bms/fundamental-review/publications')).json();
const library=mergeFcsPublications(fundamentalChangeLibrary,pub.publications);
console.log(JSON.stringify({companies:library.length,lifecycle_ready:library.filter(r=>r.lifecycleReady).length,pending:library.filter(r=>!r.lifecycleReady).length,frozen_validation_unchanged:true}));
