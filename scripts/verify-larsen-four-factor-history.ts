import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { larsenQuarterHighlights } from '../src/larsen-quarter-highlights.ts';
import { sourcesFromLarsenIndexes } from '../src/fundamental-review-official-index.ts';
import { canonicalizeDynamicEvidence } from '../src/fundamental-review-dynamic-evidence.ts';
import { checkpointFromScore,assessLifecycle } from '../src/fundamental-review-history.ts';
const { scoreFundamentalChangeReview }=await import('../../alphasynth-bms-v2/src/fcs-review-scorer.mjs');
const manifest=JSON.parse(readFileSync('data/official-quarter-cache/manifest.json','utf8'));
const original=(url:string)=>{
 const entry=manifest.documents.find((item:any)=>item.source_url===url);
 return readFileSync('data/official-quarter-cache/'+entry.sha256+(entry.media_type==='application/pdf'?'.pdf':'.html')).toString();
};
const downloads=original('https://investors.larsentoubro.com/download.aspx');
const events=original('https://investors.larsentoubro.com/Events.aspx');
const history=[];
for (const end of ['2025-12-31','2026-03-31','2026-06-30']) {
 const source=sourcesFromLarsenIndexes(downloads,events,end,'2026-10-07')[0];
 const entry=manifest.documents.find((item:any)=>item.source_url===source.url);
 const comparisons=larsenQuarterHighlights(readFileSync(`tmp/lt-history/${end}.txt`,'utf8'),end,source.published_at)!;
 const year=Number(end.slice(0,4)),month=Number(end.slice(5,7)),quarter=({3:4,6:1,12:3} as Record<number,number>)[month];
 const fy=month===3?year:year+1;
 const rows=comparisons.map(row=>({...row,symbol:'LT',metric_name:row.metric,
   factor:({revenue:'earnings',ebitda_margin:'economics',order_inflow:'execution',operating_cash_flow:'balance_sheet'} as Record<string,string>)[row.metric],
   previous_value:row.previous,current_value:row.current,
   previous_period:`Q${quarter} FY${String(fy-1).slice(-2)}`,current_period:`Q${quarter} FY${String(fy).slice(-2)}`,
   previous_period_end_date:`${year-1}${end.slice(4)}`,current_period_end_date:end,
   comparison_basis:'same_quarter_prior_year',
   consolidation_basis:row.metric==='operating_cash_flow'?'issuer_defined_operating_basis':'group_operating_basis',
   unit:row.metric==='ebitda_margin'?'percent':'INR billion',source_ref:source.url,source_date:source.published_at,
   document_sha256:entry.sha256,archived_document_uri:'file:'+process.cwd().replaceAll('\\','/')+'/data/official-quarter-cache/'+entry.sha256+'.pdf',
   quoted_label:row.quotedLabel,source_page:row.page,extraction_method:'deterministic_larsen_quarter_highlights',producer_id:'larsen-official-quarter-parser'}));
 const evidence=canonicalizeDynamicEvidence({ticker:'LT',company_name:'Larsen & Toubro Limited',cutoff:'2026-10-07',rows});
 assert.equal(evidence.candidates.length,4);
 assert.ok(evidence.candidates.every(candidate=>candidate.current_source_locator.page===comparisons[0].page));
 const score=scoreFundamentalChangeReview({symbol:'LT',...evidence});
 assert.equal(score.score_publishable,true);
 const checkpoint=checkpointFromScore({symbol:'LT',score,documents:evidence.documents,informationCutoff:'2026-10-07',calculatedAt:new Date().toISOString(),sourceJobId:'local-validator-replay'});
 assert.ok(checkpoint);history.push(checkpoint);
 console.log(JSON.stringify({period:end,fcs:score.fcs_score,raw:score.raw_score,qualified_factors:4}));
}
assert.equal(new Set(history.map(item=>item.comparabilityKey)).size,1);
const assessment=assessLifecycle(history,'2026-10-07',new Date().toISOString());
assert.ok(assessment);
console.log(JSON.stringify({mode:'local_replay_not_publication',lifecycle:assessment.classification,periods:history.map(item=>item.periodEnd),quarterly_triplet_comparable:true}));
