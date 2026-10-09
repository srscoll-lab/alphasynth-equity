import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { sourcesFromLarsenIndexes } from '../src/fundamental-review-official-index.ts';
import { extractPdfTextLocally } from '../src/pdf-text.ts';
const base = path.join(process.cwd(),'data','official-quarter-cache');
await mkdir(base,{recursive:true});
let documents:any[]=[];
try {documents=JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8')).documents;} catch {}
async function capture(source_url:string,media_type:string) {
  const response=await fetch(source_url,{signal:AbortSignal.timeout(25_000)});
  if (!response.ok || new URL(response.url || source_url).hostname !== 'investors.larsentoubro.com') throw Error('Issuer acquisition unavailable');
  const bytes=Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length>20*1024*1024 || (media_type==='application/pdf' && bytes.subarray(0,5).toString()!=='%PDF-')) throw Error('Invalid issuer bytes');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const old=documents.find(item=>item.source_url===source_url);
  if (old && old.sha256!==sha256) throw Error('Immutable cache conflict: explicit review required');
  const filename=path.join(base,sha256+(media_type==='application/pdf'?'.pdf':'.html'));
  await writeFile(filename,bytes,{flag:'wx'}).catch(async error=>{
    if (error.code!=='EEXIST' || createHash('sha256').update(await readFile(filename)).digest('hex')!==sha256) throw error;
  });
  if (!old) documents.push({source_url,sha256,media_type,captured_at:new Date().toISOString(),acquisition_method:'direct_http'});
  return bytes;
}
const downloads=(await capture('https://investors.larsentoubro.com/download.aspx','text/html')).toString();
const events=(await capture('https://investors.larsentoubro.com/Events.aspx','text/html')).toString();
for (const end of ['2025-12-31','2026-03-31','2026-06-30']) {
  const sources=sourcesFromLarsenIndexes(downloads,events,end,'2026-10-07');
  if (sources.length!==1) throw Error('Missing or ambiguous dated quarterly source: '+end);
  const bytes=await capture(sources[0].url,'application/pdf');
  const text=await extractPdfTextLocally(bytes,40);
  await mkdir('tmp/lt-history',{recursive:true});
  await writeFile(`tmp/lt-history/${end}.txt`,text);
  console.log(JSON.stringify({period:end,published_at:sources[0].published_at,original_pdf_bytes:bytes.length,source_url:sources[0].url}));
}
await writeFile(path.join(base,'manifest.json'),JSON.stringify({schema_version:'1.0.0',documents},null,2));
console.log('Three issuer presentation originals acquired. No scores or lifecycle published; no model calls.');
