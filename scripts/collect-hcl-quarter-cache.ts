import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {HCL_QUARTER_INDEX,hclReleaseFromIndex,hclCoverDate} from '../src/hcl-quarter-index.ts';
import {extractPdfTextLocally} from '../src/pdf-text.ts';
const base='data/official-quarter-cache/';
await mkdir(base,{recursive:true});
const documents=JSON.parse(await readFile(base+'manifest.json','utf8')).documents;
async function capture(url:string,type:string) {
 const response=await fetch(url,{signal:AbortSignal.timeout(25_000)});
 if(!response.ok || new URL(response.url || url).hostname!=='www.hcltech.com')throw Error('Issuer acquisition unavailable: '+url);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(!bytes.length || bytes.length>20*1024*1024 || (type==='application/pdf' && bytes.subarray(0,5).toString()!=='%PDF-'))throw Error('Invalid official bytes');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const old=documents.find((entry:any)=>entry.source_url===url);
 if(old && old.sha256!==sha256)throw Error('Immutable cache conflict; explicit review required');
 const filename=base+sha256+(type==='application/pdf'?'.pdf':'.html');
 await writeFile(filename,bytes,{flag:'wx'}).catch(async error=>{if(error.code!=='EEXIST' || createHash('sha256').update(await readFile(filename)).digest('hex')!==sha256)throw error;});
 if(!old)documents.push({source_url:url,sha256,media_type:type,captured_at:new Date().toISOString(),acquisition_method:'direct_http'});
 return bytes;
}
const html=(await capture(HCL_QUARTER_INDEX,'text/html')).toString();
await mkdir('tmp/hcl-history',{recursive:true});
for(const end of ['2024-12-31','2025-03-31','2025-06-30','2025-12-31','2026-03-31','2026-06-30']) {
 const url=hclReleaseFromIndex(html,end);if(!url)throw Error('Ambiguous or missing issuer release: '+end);
 const bytes=await capture(url,'application/pdf');
 const cover=await extractPdfTextLocally(bytes,2);
 const published=hclCoverDate(cover,end);if(!published || published>'2026-10-07')throw Error('Cover-date/quarter gate failed: '+end);
 await writeFile(`tmp/hcl-history/${end}.txt`,await extractPdfTextLocally(bytes,40));
 await writeFile(base+'manifest.json',JSON.stringify({schema_version:'1.0.0',documents},null,2));
 console.log(JSON.stringify({period:end,published_at:published,source_url:url,original_bytes:bytes.length}));
}
await writeFile(base+'manifest.json',JSON.stringify({schema_version:'1.0.0',documents},null,2));
console.log('Six issuer releases captured, dates verified from PDF covers. No scores published or model calls.');
