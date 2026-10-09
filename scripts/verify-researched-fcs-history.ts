import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {hclQuarterEvidence} from '../src/hcl-quarter-evidence.ts';
import {hclReleaseFromIndex,hclCoverDate,HCL_QUARTER_INDEX} from '../src/hcl-quarter-index.ts';
import {replayResearch,verifyResearchRow} from './replay-researched-fcs-history.ts';
const manifest=JSON.parse(readFileSync('data/official-quarter-cache/manifest.json','utf8'));
const index=manifest.documents.find((entry:any)=>entry.source_url===HCL_QUARTER_INDEX);
const html=readFileSync(resolve('data/official-quarter-cache',`${index.sha256}.html`),'utf8');
const document=(period:string)=>{
 const entry=manifest.documents.find((item:any)=>item.source_url===hclReleaseFromIndex(html,period));
 return {source_ref:entry.source_url,source_date:hclCoverDate(readFileSync(`tmp/hcl-history/${period}.txt`,'utf8'),period),
  document_sha256:entry.sha256,archived_document_uri:pathToFileURL(resolve('data/official-quarter-cache',`${entry.sha256}.pdf`)).href};
};
const quarters=['2025-12-31','2026-03-31','2026-06-30'].map(end=>({period_end:end,rows:hclQuarterEvidence({end,cutoff:'2026-10-07',
 currentText:readFileSync(`tmp/hcl-history/${end}.txt`,'utf8'),previousText:readFileSync(`tmp/hcl-history/${Number(end.slice(0,4))-1}${end.slice(4)}.txt`,'utf8'),
 currentDocument:document(end),previousDocument:document(`${Number(end.slice(0,4))-1}${end.slice(4)}`)})}));
const input={information_cutoff:'2026-10-07',companies:[{symbol:'HCLTECH',company_name:'HCL Technologies',quarters}]};
assert.equal(quarters.flatMap(q=>q.rows).length,12);
assert.equal(replayResearch(input).companies[0].comparable_lifecycle,'REBOUNDING');
const row=quarters[0].rows[0];
assert.ok(verifyResearchRow({...row,current_value:null},quarters[0].period_end,'2026-10-07').includes('invalid_current_value'));
assert.ok(verifyResearchRow({...row,document_sha256:'0'.repeat(64)},quarters[0].period_end,'2026-10-07').some(s=>s.includes('archive_hash_mismatch')));
assert.ok(verifyResearchRow({...row,source_date:'2026-10-08'},quarters[0].period_end,'2026-10-07').includes('current_publication_cutoff'));
assert.ok(verifyResearchRow({...row,source_page:0},quarters[0].period_end,'2026-10-07').includes('missing_source_page'));
assert.ok(verifyResearchRow(row,'2026-03-31','2026-10-07').includes('wrong_current_period'));
assert.equal(replayResearch({...input,companies:[{...input.companies[0],quarters:[...quarters,quarters[0]]}]}).companies[0].comparable_lifecycle,null);
console.log('Research replay: original HCL series reproduces REBOUNDING; missing value, altered archive, post-cutoff source, missing page, wrong period and duplicate-quarter checks pass. No publication.');
