import type {GroundedDocumentCandidate} from './fcs-grounded-document-retrieval.ts';

type Search = (query:string, options:any)=>Promise<any>;
type Discovery = {candidates:GroundedDocumentCandidate[];diagnostics:any[]};
const cache=new Map<string,{expires:number;promise:Promise<Discovery>}>();

/** Search results provide URLs only. Actual originals still pass the normal
 * download, issuer, publication-date, period and numeric evidence checks. */
export async function discoverFirecrawlFcsSources(input:{companyName:string;ticker:string;cutoff:string;targetPeriodEnd?:string|null;trustedIssuerDomains:readonly string[];search:Search}):Promise<Discovery>{
  const domains=[...new Set(input.trustedIssuerDomains.filter(d=>/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(d)))];
  const key=JSON.stringify([input.ticker,input.companyName,input.cutoff,input.targetPeriodEnd,domains]);
  const old=cache.get(key);if(old&&old.expires>Date.now())return old.promise;
  const promise=(async():Promise<Discovery>=>{
    const year=Number((input.targetPeriodEnd||input.cutoff).slice(0,4));
    const scope=(domains.length?domains:['nsearchives.nseindia.com','bseindia.com']).map(d=>`site:${d}`).join(' OR ');
    const query=`${input.companyName} ${input.ticker} (${scope}) quarterly financial results earnings presentation ${input.targetPeriodEnd||year} pdf`;
    try {
      const result=await input.search(query,{limit:8,sources:['web'],timeout:30000});
      const rows=Array.isArray(result?.web)?result.web:Array.isArray(result?.data?.web)?result.data.web:[];
      const found=new Map<string,GroundedDocumentCandidate>();
      const allowed=[...domains,'nsearchives.nseindia.com','archives.nseindia.com','bseindia.com','nseindia.com'];
      for(const row of rows.slice(0,8)){
        // Inspect links throughout bounded results, including links near the end
        // of a chronological investor index. Search prose is never evidence.
        const text=`${row.url||''}\n${String(row.description||'').slice(0,100000)}`;
        for(const match of text.matchAll(/https:\/\/[^\s<>"']+/gi)){
          try{
            const url=new URL(match[0].replace(/[),.;\]*]+$/g,''));
            if(url.username||url.password||url.port||!allowed.some(d=>url.hostname===d||url.hostname.endsWith('.'+d)))continue;
            url.hash='';
            if(/\.(zip|mp3|mp4|gif|png|jpg)$/i.test(url.pathname))continue;
            found.set(url.href,{uri:url.href,title:String(row.title||'Official financial document URL').slice(0,200)});
          }catch{/* Invalid URL is not a source. */}
        }
      }
      const rank=(item:GroundedDocumentCandidate)=>{
        const url=decodeURIComponent(item.uri);const years=[...url.matchAll(/20\d{2}/g)].map(m=>Number(m[0])).filter(y=>y<=year+1);
        const fiscal=url.match(/\/(20\d{2})-\d{2}\/q([1-4])[-_/]/i);
        const q=fiscal?Number(fiscal[2]):0;
        const end=fiscal?`${Number(fiscal[1])+(q===4?1:0)}-${String(q===4?3:q*3+3).padStart(2,'0')}-${q===1||q===2?'30':'31'}`:'';
        return (/\.pdf(?:\?|$)/i.test(url)?100000000:0)+(input.targetPeriodEnd&&end===input.targetPeriodEnd?1000000000:0)+(end?Number(end.replaceAll('-','')):(years.length?Math.max(...years):0)*10000)+(/earning.*presentation/i.test(url)?10:0);
      };
      const candidates=[...found.values()].sort((a,b)=>rank(b)-rank(a)).slice(0,24);
      return {candidates,diagnostics:[{outcome:'firecrawl_official_url_discovery',search_calls:1,result_count:rows.length,candidate_count:candidates.length}]};
    }catch{return {candidates:[],diagnostics:[{outcome:'firecrawl_discovery_unavailable'}]};}
  })();
  if(cache.size>=100)cache.delete(cache.keys().next().value!);
  cache.set(key,{expires:Date.now()+6*60*60*1000,promise});
  const result=await promise;
  if(!result.candidates.length)cache.delete(key);
  return result;
}
