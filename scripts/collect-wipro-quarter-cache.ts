import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {WIPRO_RELEASES,wiproCoverDate,wiproHighlights} from '../src/wipro-quarter-evidence.ts';
import {extractPdfTextLocally} from '../src/pdf-text.ts';
const base='data/official-quarter-cache/';
const manifest=JSON.parse(await readFile(base+'manifest.json','utf8'));
for(const [end,url]of Object.entries(WIPRO_RELEASES)) {
 const cached=manifest.documents.find((d:any)=>d.source_url===url);
 let bytes:Buffer;
 if(cached)bytes=await readFile(base+cached.sha256+'.pdf');
 else {
 const response=await fetch(url,{signal:AbortSignal.timeout(20_000)});
 if(!response.ok||new URL(response.url||url).hostname!=='www.wipro.com')throw Error('Source unavailable '+end);
 bytes=Buffer.from(await response.arrayBuffer());
 }
 if(bytes.length>20_000_000||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid original');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const old=manifest.documents.find((d:any)=>d.source_url===url);
 if(old&&old.sha256!==sha256)throw Error('Immutable original conflict');
 const text=await extractPdfTextLocally(bytes,3),date=wiproCoverDate(text,end);
 if(!date||!wiproHighlights(text,end,date))throw Error('Quarter highlights rejected '+end);
 await writeFile(base+sha256+'.pdf',bytes,{flag:'wx'}).catch(async e=>{if(e.code!=='EEXIST'||createHash('sha256').update(await readFile(base+sha256+'.pdf')).digest('hex')!==sha256)throw e;});
 if(!old)manifest.documents.push({source_url:url,sha256,media_type:'application/pdf',captured_at:new Date().toISOString(),acquisition_method:'direct_http'});
 await writeFile(base+'manifest.json',JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({end,published:date,sha256,values:wiproHighlights(text,end,date)}));
}
