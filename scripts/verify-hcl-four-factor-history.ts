import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hclQuarterEvidence,HCL_METRIC_DEFINITIONS} from '../src/hcl-quarter-evidence.ts';
import {canonicalizeDynamicEvidence} from '../src/fundamental-review-dynamic-evidence.ts';
import {hclReleaseFromIndex,HCL_QUARTER_INDEX} from '../src/hcl-quarter-index.ts';
import {discoverIndexedOfficialSources} from '../src/fundamental-review-official-index.ts';
import {cachedOfficialDocument,officialDocumentFetch} from '../src/official-document-cache.ts';
import {checkpointFromScore,assessLifecycle} from '../src/fundamental-review-history.ts';
const {scoreFundamentalChangeReview}=await import('../../alphasynth-bms-v2/src/fcs-review-scorer.mjs');
const manifest=JSON.parse(readFileSync('data/official-quarter-cache/manifest.json','utf8'));
const html=(await cachedOfficialDocument(HCL_QUARTER_INDEX))!.bytes.toString();
const history=[];
for(const end of ['2025-12-31','2026-03-31','2026-06-30']) {
 const previous=`${Number(end.slice(0,4))-1}${end.slice(4)}`;
 const document=async (period:string)=>{
  const source=(await discoverIndexedOfficialSources('HCLTECH',period,'2026-10-07',officialDocumentFetch))[0];
  assert.equal(source.url,hclReleaseFromIndex(html,period));
  const entry=manifest.documents.find((item:any)=>item.source_url===source.url);
  return {source_ref:source.url,source_date:source.published_at,document_sha256:entry.sha256,
    archived_document_uri:'file:'+process.cwd().replaceAll('\\','/')+'/data/official-quarter-cache/'+entry.sha256+'.pdf'};
 };
 const input={end,cutoff:'2026-10-07',currentText:readFileSync(`tmp/hcl-history/${end}.txt`,'utf8'),previousText:readFileSync(`tmp/hcl-history/${previous}.txt`,'utf8'),currentDocument:await document(end),previousDocument:await document(previous)};
 const rows=hclQuarterEvidence(input);assert.equal(rows.length,4);
 assert.equal(hclQuarterEvidence({...input,requiredDefinitions:[{factor:'economics',metric:'operating_margin',unit:'percent',consolidation_basis:'consolidated',comparison_basis:'same_quarter_prior_year'}]}).length,0,'Different accounting basis is not silently accepted');
 const definitions=HCL_METRIC_DEFINITIONS.map(item=>({factor:item.factor,metric:item.metric,unit:item.unit,consolidation_basis:item.basis,comparison_basis:item.comparison}));
 assert.equal(hclQuarterEvidence({...input,requiredDefinitions:definitions}).length,4);
 const evidence=canonicalizeDynamicEvidence({ticker:'HCLTECH',company_name:'HCL Technologies Limited',cutoff:'2026-10-07',rows});
 assert.equal(evidence.candidates.length,4);
 assert.ok(evidence.candidates.every((candidate:any)=>candidate.previous_source_locator.page && candidate.current_source_locator.page));
 const score=scoreFundamentalChangeReview({symbol:'HCLTECH',...evidence});assert.equal(score.score_publishable,true);
 const checkpoint=checkpointFromScore({symbol:'HCLTECH',score,documents:evidence.documents,informationCutoff:'2026-10-07',calculatedAt:new Date().toISOString(),sourceJobId:'local-validator-replay'});assert.ok(checkpoint);history.push(checkpoint);
 console.log(JSON.stringify({period:end,fcs:score.fcs_score,raw:score.raw_score,qualified_factors:4}));
}
assert.equal(new Set(history.map(item=>item.comparabilityKey)).size,1);
const assessment=assessLifecycle(history,'2026-10-07',new Date().toISOString());assert.ok(assessment);
console.log(JSON.stringify({mode:'local_replay_not_publication',lifecycle:assessment.classification,quarters:3,original_sources:6}));
