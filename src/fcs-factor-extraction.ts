/** At most four calls, two concurrent. A failed factor cannot discard the rest. */
export async function extractFcsFactors(factors:readonly string[],run:(factor:string)=>Promise<string>){
  const allowed=['earnings','economics','execution','balance_sheet'];
  const requested=[...new Set(factors)].filter(f=>allowed.includes(f));
  const rows:any[]=[];const diagnostics:any[]=[];
  for(let start=0;start<requested.length;start+=2){
    await Promise.all(requested.slice(start,start+2).map(async factor=>{
      try{
        const text=await run(factor);
        const parsed=JSON.parse(text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
        const candidates=Array.isArray(parsed.rows)?parsed.rows.filter((r:any)=>r.factor===factor).slice(0,2):[];
        rows.push(...candidates);diagnostics.push({outcome:'factor_extraction_completed',factor,candidate_count:candidates.length});
      }catch{diagnostics.push({outcome:'factor_extraction_failed',factor});}
    }));
  }
  rows.sort((a,b)=>allowed.indexOf(a.factor)-allowed.indexOf(b.factor));
  return {rows,diagnostics};
}
