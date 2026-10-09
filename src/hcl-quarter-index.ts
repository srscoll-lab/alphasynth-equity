import { extractPdfTextLocally } from './pdf-text.ts';
export const HCL_QUARTER_INDEX='https://www.hcltech.com/investor-relations/quarter-results';
/** Resolve links from the fiscal-year/quarter sections, not guessed filenames. */
export function hclReleaseFromIndex(html:string,end:string):string|null {
 if(!/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(end)) return null;
 const year=Number(end.slice(0,4)),month=Number(end.slice(5,7));
 const quarter=({3:4,6:1,9:2,12:3} as Record<number,number>)[month];
 const start=month===3?year-1:year;
 const sections=html.split(/(?=<div class="card-header" id="heading-\d{4}-\d{2}")/);
 const section=sections.find(part=>part.startsWith(`<div class="card-header" id="heading-${start}-${String(start+1).slice(-2)}"`));
 if(!section) return null;
 const boxes=section.split(/(?=<div class="financial-quarter">Q[1-4]<\/div>)/);
 const box=boxes.find(part=>part.startsWith(`<div class="financial-quarter">Q${quarter}</div>`));
 if(!box) return null;
 const urls=[...box.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*Investor Release\s*<\/a>/gi)].flatMap(match=>{
   try {const url=new URL(match[1].replaceAll('&amp;','&'),HCL_QUARTER_INDEX);return url.protocol==='https:' && url.hostname==='www.hcltech.com' && url.pathname.startsWith('/sites/default/files/') && /\.pdf$/i.test(url.pathname)?[url.href]:[];} catch{return [];}
 });
 return new Set(urls).size===1?urls[0]:null;
}
/** Publication date and quarter identity must both be explicit in original cover bytes. */
export function hclCoverDate(text:string,end:string):string|null {
 if(!/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(end))return null;
 const flat=text.replace(/\s+/g,' ');
 const year=Number(end.slice(0,4)),month=Number(end.slice(5,7));
 const quarter=({3:4,6:1,9:2,12:3} as Record<number,number>)[month],fy=month===3?year:year+1;
 if(!new RegExp(`Q${quarter}\\s*(?:&\\s*Annual\\s*)?FY\\s*(?:${fy}|${String(fy).slice(-2)})\\b`,'i').test(flat)) return null;
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const dates=[...flat.matchAll(/Investor Release\s+(?:dated\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/g)]
   .map(match=>`${match[3]}-${String(months.indexOf(match[1])+1).padStart(2,'0')}-${match[2].padStart(2,'0')}`);
 if(new Set(dates).size!==1 || dates[0]<=end) return null;
 return dates[0];
}
export async function discoverHclSources(end:string,cutoff:string,fetchImpl:typeof fetch) {
 try {
   const response=await fetchImpl(HCL_QUARTER_INDEX,{signal:AbortSignal.timeout(12_000)});
   if(!response.ok || new URL(response.url || HCL_QUARTER_INDEX).hostname!=='www.hcltech.com') return [];
   const html=await response.text();if(html.length>2_000_000)return [];
   const ends=end?[end]:(()=>{const date=new Date(cutoff+'T00:00:00Z');if(!Number.isFinite(date.getTime()))return [];const latest=new Date(Date.UTC(date.getUTCFullYear(),Math.floor(date.getUTCMonth()/3)*3,0));return [latest.toISOString().slice(0,10),new Date(Date.UTC(latest.getUTCFullYear(),latest.getUTCMonth()-2,0)).toISOString().slice(0,10)];})();
   for(const period of ends) {
     const url=hclReleaseFromIndex(html,period);if(!url)continue;
     const pdf=await fetchImpl(url,{signal:AbortSignal.timeout(15_000)});
     if(!pdf.ok || new URL(pdf.url || url).hostname!=='www.hcltech.com' || Number(pdf.headers.get('content-length') || 0)>20*1024*1024)continue;
     const bytes=new Uint8Array(await pdf.arrayBuffer());if(bytes.length>20*1024*1024 || Buffer.from(bytes.subarray(0,5)).toString()!=='%PDF-')continue;
     const published_at=hclCoverDate(await extractPdfTextLocally(bytes,2),period);
     if(published_at && published_at<=cutoff)return [{url,published_at,period_end:period,source_type:'company_filing' as const}];
   }
   return [];
 } catch{return [];}
}
