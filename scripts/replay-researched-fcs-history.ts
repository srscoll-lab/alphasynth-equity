import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {canonicalizeDynamicEvidence} from '../src/fundamental-review-dynamic-evidence.ts';
import {checkpointFromScore,assessLifecycle,type FcsCheckpoint} from '../src/fundamental-review-history.ts';
const {scoreFundamentalChangeReview}=await import('../../alphasynth-bms-v2/src/fcs-review-scorer.mjs');

// Read-only admission/replay of researched rows. This cannot publish a report.
// Archive integrity is checked here; a human/source reviewer must still verify
// that each value, page and accounting definition actually matches its source.
export function verifyResearchRow(row:any,period:string,cutoff:string):string[] {
 const errors:string[]=[];
 if(row.current_period_end_date!==period)errors.push('wrong_current_period');
 if(!/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(period)||period>cutoff)errors.push('invalid_quarter');
 for(const key of ['current_value','previous_value'])
  if(typeof row[key]!=='number'||!Number.isFinite(row[key]))errors.push(`invalid_${key}`);
 for(const key of ['source_page','previous_source_page'])
  if(!Number.isInteger(row[key])||row[key]<1)errors.push(`missing_${key}`);
 for(const key of ['quoted_label','previous_quoted_label'])
  if(typeof row[key]!=='string'||!row[key].trim())errors.push(`missing_${key}`);
 const previous=row.previous_document||row;
 for(const [name,document] of [['current',row],['previous',previous]] as const) {
  if(!/^https:\/\//.test(document.source_ref||''))errors.push(`${name}_source_url`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(document.source_date||'')||document.source_date>cutoff)errors.push(`${name}_publication_cutoff`);
  try {
   const uri=String(document.archived_document_uri||'');
   if(!uri.startsWith('file:'))throw new Error('local_original_required');
   const bytes=readFileSync(fileURLToPath(uri));
   if(createHash('sha256').update(bytes).digest('hex')!==document.document_sha256)throw new Error('archive_hash_mismatch');
  }catch(error){errors.push(`${name}_${(error as Error).message}`);}
 }
 return errors;
}

export function replayResearch(input:any) {
 const cutoff=String(input.information_cutoff||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(cutoff))throw new Error('Explicit information_cutoff required');
 if(!Array.isArray(input.companies)||input.companies.length>3)throw new Error('Capped batch supports at most three companies');
 return {mode:'local_replay_not_publication',information_cutoff:cutoff,companies:input.companies.map((company:any)=>{
  const history:FcsCheckpoint[]=[];
  const seen=new Set<string>();
  let duplicate=false;
  const quarters=(company.quarters||[]).map((quarter:any)=>{
   const period=String(quarter.period_end||'');
   if(seen.has(period)){duplicate=true;return {period,accepted:false,reasons:['duplicate_quarter']};}
   seen.add(period);
   const rows=quarter.rows||[];
   const errors=rows.flatMap((row:any,index:number)=>verifyResearchRow(row,period,cutoff).map(reason=>({row:index,reason})));
   if(errors.length)return {period,accepted:false,reasons:errors};
   const evidence=canonicalizeDynamicEvidence({ticker:company.symbol,company_name:company.company_name,cutoff,rows});
   const score=scoreFundamentalChangeReview({symbol:company.symbol,...evidence});
   const checkpoint=checkpointFromScore({symbol:company.symbol,score,documents:evidence.documents,informationCutoff:cutoff,calculatedAt:new Date().toISOString(),sourceJobId:'bounded-research-local-replay'});
   if(checkpoint)history.push(checkpoint);
   return {period,accepted:!!checkpoint,fcs:checkpoint?.fcsScore??null,diagnostics:evidence.diagnostics};
  });
  const lifecycle=duplicate?null:assessLifecycle(history,cutoff,new Date().toISOString());
  return {symbol:company.symbol,quarters,comparable_lifecycle: lifecycle?.classification??null,history_through:lifecycle?.latestPeriodEnd??null,
   source_review_required:true,gaps:company.gaps||[]};
 })};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
 if(!process.argv[2])throw new Error('Usage: node --import tsx scripts/replay-researched-fcs-history.ts evidence.json');
 console.log(JSON.stringify(replayResearch(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2));
}
