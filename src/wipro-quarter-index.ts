import {WIPRO_RELEASES,wiproCoverDate} from './wipro-quarter-evidence.ts';
import {extractPdfTextLocally} from './pdf-text.ts';
import type {OfficialIndexedSource} from './fundamental-review-official-index.ts';
// Bounded, reviewed issuer links only. Publication dates must come from the PDF.
export async function discoverWiproSources(end:string,cutoff:string,fetchImpl:typeof fetch=fetch):Promise<OfficialIndexedSource[]> {
 const periods=end?[end]:Object.keys(WIPRO_RELEASES).filter(p=>p<cutoff).sort().reverse().slice(0,2);
 for(const period of periods) {
  const url=WIPRO_RELEASES[period];if(!url)continue;
  try {
   const response=await fetchImpl(url,{signal:AbortSignal.timeout(15_000)});
   if(!response.ok||new URL(response.url||url).hostname!=='www.wipro.com')continue;
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length>20_000_000||bytes.subarray(0,5).toString()!=='%PDF-')continue;
   const date=wiproCoverDate(await extractPdfTextLocally(bytes,3),period);
   if(date&&date<=cutoff)return [{url,published_at:date,source_type:'company_filing',period_end:period}];
  }catch{/* An unavailable official source remains unavailable. */}
 }
 return [];
}
