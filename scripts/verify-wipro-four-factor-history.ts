import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {WIPRO_RELEASES,WIPRO_DEFINITIONS,wiproQuarterEvidence,wiproHighlights,wiproCoverDate} from '../src/wipro-quarter-evidence.ts';
import {extractPdfTextLocally} from '../src/pdf-text.ts';
import {canonicalizeDynamicEvidence} from '../src/fundamental-review-dynamic-evidence.ts';
import {checkpointFromScore,assessLifecycle} from '../src/fundamental-review-history.ts';
const {scoreFundamentalChangeReview}=await import('../../alphasynth-bms-v2/src/fcs-review-scorer.mjs');
const manifest=JSON.parse(readFileSync('data/official-quarter-cache/manifest.json','utf8'));
const expected:Record<string,number[]>={
 '2024-12-31':[223.2,33.5,17.5,3514,49.3],'2025-03-31':[225,35.7,17.5,3955,37.5],
 '2025-06-30':[221.3,33.3,17.3,4971,41.1],'2025-12-31':[235.6,31.2,17.6,3335,42.6],
 '2026-03-31':[242.4,35,17.3,3455,31.7],'2026-06-30':[244.8,33.6,16,3370,32.9],
};
const documents:Record<string,any>={},texts:Record<string,string>={};
for(const [period,url]of Object.entries(WIPRO_RELEASES)) {
 const entry=manifest.documents.find((d:any)=>d.source_url===url);assert.ok(entry);
 const path=resolve('data/official-quarter-cache/'+entry.sha256+'.pdf');
 texts[period]=await extractPdfTextLocally(readFileSync(path),3);
 const date=wiproCoverDate(texts[period],period);assert.ok(date);
 documents[period]={source_ref:url,source_date:date,document_sha256:entry.sha256,archived_document_uri:pathToFileURL(path).href};
 const values=wiproHighlights(texts[period],period,date)!;assert.ok(values);
 assert.deepEqual(WIPRO_DEFINITIONS.map(d=>values[d.metric].value),expected[period]);
 assert.equal(wiproHighlights(texts[period],'2020-06-30',date),null);
 assert.equal(wiproHighlights(texts[period].replace(/Operating cash flows of/g,'Missing cash flows of'),period,date),null);
}
const history=[];
for(const end of ['2025-12-31','2026-03-31','2026-06-30']) {
 const previous=`${Number(end.slice(0,4))-1}${end.slice(4)}`;
 const input={end,cutoff:'2026-10-07',currentText:texts[end],previousText:texts[previous],currentDocument:documents[end],previousDocument:documents[previous]};
 const rows=wiproQuarterEvidence(input);assert.equal(rows.length,5);
 assert.equal(wiproQuarterEvidence({...input,cutoff:end}).length,0);
 assert.equal(wiproQuarterEvidence({...input,requiredDefinitions:[{factor:'economics',metric:'operating_margin',unit:'percent',consolidation_basis:'consolidated'}]}).length,0);
 const evidence=canonicalizeDynamicEvidence({ticker:'WIPRO',company_name:'Wipro Limited',cutoff:input.cutoff,rows});
 assert.equal(evidence.candidates.length,5);
 const score=scoreFundamentalChangeReview({symbol:'WIPRO',...evidence});assert.equal(score.score_publishable,true);
 const checkpoint=checkpointFromScore({symbol:'WIPRO',score,documents:evidence.documents,informationCutoff:input.cutoff,calculatedAt:new Date().toISOString(),sourceJobId:'local-wipro-validator'});
 assert.ok(checkpoint);history.push(checkpoint);
 console.log(JSON.stringify({period:end,fcs:score.fcs_score,qualified_factors:4}));
}
assert.equal(new Set(history.map(c=>c.comparabilityKey)).size,1);
const lifecycle=assessLifecycle(history,'2026-10-07',new Date().toISOString());assert.ok(lifecycle);
console.log(JSON.stringify({mode:'local_replay_not_publication',lifecycle:lifecycle.classification,quarters:3,original_sources:6}));
