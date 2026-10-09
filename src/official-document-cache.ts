import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Private deployment assets: original issuer bytes, not model summaries.
// Cache admission is URL-bound and SHA-256 checked on every read. No public input
// can supply a local path. Unknown URLs continue through ordinary live fetching.
export async function cachedOfficialDocument(url: string, base = path.join(process.cwd(), 'data', 'official-quarter-cache')) {
  try {
    const manifest = JSON.parse(await readFile(path.join(base, 'manifest.json'), 'utf8'));
    const entry = manifest.documents.find((item: any) => item.source_url === url);
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256) || !/^\d{4}-\d{2}-\d{2}T/.test(entry.captured_at)) return null;
    if (!['www.infosys.com','investors.larsentoubro.com','www.hcltech.com','www.wipro.com','insights.techmahindra.com','www.persistent.com','investors.coforge.com','www.tcs.com','www.sebi.gov.in','sebi.gov.in','nsearchives.nseindia.com','archives.nseindia.com','www.bseindia.com'].includes(new URL(url).hostname)) return null;
    const bytes = await readFile(path.join(base, entry.sha256 + (entry.media_type === 'application/pdf' ? '.pdf' : '.html')));
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) return null;
    return { bytes, mediaType: entry.media_type as string };
  } catch { return null; }
}
export function createOfficialDocumentFetch(remoteFetch:typeof fetch=fetch,
  loadCached:(url:string)=>Promise<{bytes:Buffer;mediaType:string}|null>=cachedOfficialDocument,now=Date.now):typeof fetch {
 const refreshedIndexes=new Map<string,{expires:number;response:Promise<Response|null>}>();
 return async (input, init) => {
  const url = String(input);
  if(init?.signal?.aborted)throw new DOMException('Document lookup aborted','AbortError');
  const cached = await loadCached(url);
  // An immutable old index is a fallback, not a permanent substitute for today's
  // issuer index. Check live HTML once per ten minutes per instance; PDFs retain
  // their immutable archived identity. No model call or cache-file overwrite.
  if(cached?.mediaType==='text/html') {
    let refreshed=refreshedIndexes.get(url);
    if(!refreshed || refreshed.expires<now()) {
      const response=(async()=>{
        try {
          const signal=init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(12_000)]):AbortSignal.timeout(12_000);
          const live=await remoteFetch(input,{...init,signal});
          if(!live.ok || new URL(live.url || url).hostname!==new URL(url).hostname)return null;
          if(Number(live.headers.get('content-length') || 0)>2_000_000)return null;
          const text=await live.text();if(text.length>2_000_000)return null;
          const result=new Response(text,{headers:{'content-type':'text/html'}});
          Object.defineProperty(result,'url',{value:live.url || url});return result;
        } catch{return null;}
      })();
      refreshed={expires:now()+600_000,response};refreshedIndexes.set(url,refreshed);
    }
    const live=await refreshed.response;
    if(init?.signal?.aborted)throw new DOMException('Document lookup aborted','AbortError');
    if(live){const copy=live.clone();Object.defineProperty(copy,'url',{value:live.url || url});return copy;}
  }
  if (cached) {
    const response = new Response(new Uint8Array(cached.bytes), { headers: { 'content-type': cached.mediaType, 'content-length': String(cached.bytes.length) } });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  }
  return remoteFetch(input, init);
 };
}
export const officialDocumentFetch=createOfficialDocumentFetch();
