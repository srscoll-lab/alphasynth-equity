import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {periods} from '../src/techm-reviewed-quarter-ledger.ts';
const base='data/official-quarter-cache/',manifest=JSON.parse(await readFile(base+'manifest.json','utf8'));
const documents=[...Object.values(periods).map(d=>({sha:d.sha,file:d.file})),{sha:'a3e4d811719899298abe0483c5dac86c8f2f7a312f20ee57bec73ee9db2f8bd9',file:'tml-q4-fy-26-earnings-presentation.pdf'}];
for(const d of documents){
 const bytes=await readFile('tmp/three-company-history-20261007/'+d.sha+'.pdf');
 if(createHash('sha256').update(bytes).digest('hex')!==d.sha||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Original mismatch');
 const url='https://insights.techmahindra.com/investors/'+d.file,old=manifest.documents.find((r:any)=>r.source_url===url);
 if(old&&old.sha256!==d.sha)throw Error('Immutable original conflict');
 await writeFile(base+d.sha+'.pdf',bytes,{flag:'wx'}).catch(async e=>{if(e.code!=='EEXIST'||createHash('sha256').update(await readFile(base+d.sha+'.pdf')).digest('hex')!==d.sha)throw e;});
 if(!old)manifest.documents.push({source_url:url,sha256:d.sha,media_type:'application/pdf',captured_at:new Date().toISOString(),acquisition_method:'direct_http_reviewed_original'});
}
await writeFile(base+'manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({company:'TECHM',originals:7,cache_verified:true}));
