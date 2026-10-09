import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fundamentalChangeLibrary } from "../src/data/fundamentalChangeLibrary.ts";
import { mergeFcsPublications } from "../src/fcs-publications.ts";
const base="https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app";
const manifest=JSON.parse(await readFile("data/official-quarter-cache/manifest.json","utf8"));
const response=await fetch(`${base}/api/bms/fundamental-review/result/TCS`,{signal:AbortSignal.timeout(30_000)});assert.equal(response.status,200);
const payload:any=await response.json();assert.equal(payload.job.status,"ready");assert.equal(payload.result.score_publishable,true);
assert.equal(payload.result.lifecycle_ready,true);assert.equal(payload.result.lifecycle,"FADING");
assert.deepEqual(payload.result.checkpoints.map((c:any)=>c.fcsScore),[64,56,53]);
assert.equal(new Set(payload.result.checkpoints.map((c:any)=>c.comparabilityKey)).size,1);
const sources=new Set<string>();
for(const checkpoint of payload.result.checkpoints){assert.equal(checkpoint.completeFactors,4);assert.equal(checkpoint.evidenceReferences.length,4);
 for(const reference of checkpoint.evidenceReferences){assert.ok(reference.currentLocator.page);assert.ok(reference.previousLocator.page);}
 for(const document of checkpoint.documentReferences){assert.ok(document.archiveUri.startsWith("gs://"));const entry=manifest.documents.find((item:any)=>item.sha256===document.sha256&&item.source_url===document.sourceUrl);assert.ok(entry);
 const bytes=await readFile(`data/official-quarter-cache/${document.sha256}.pdf`);assert.equal(createHash("sha256").update(bytes).digest("hex"),document.sha256);sources.add(document.sha256);}}
assert.equal(sources.size,6);
const publications:any=await(await fetch(`${base}/api/bms/fundamental-review/publications`)).json();
const library=mergeFcsPublications(fundamentalChangeLibrary,publications.publications);const tcs=library.find(record=>record.symbol==="TCS");assert.ok(tcs);assert.equal(tcs.fcsScore,53);assert.equal(tcs.lifecycleReady,true);
console.log(JSON.stringify({symbol:"TCS",published:true,fcs:53,lifecycle:"FADING",quarters:3,verified_originals:sources.size,companies:library.length,lifecycle_ready:library.filter(r=>r.lifecycleReady).length,pending:library.filter(r=>!r.lifecycleReady).length,frozen_validation_unchanged:true}));
