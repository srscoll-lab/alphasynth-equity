import type {GroundedDocumentCandidate} from './fcs-grounded-document-retrieval.ts';
/** Follow only links on already verified issuer hosts. No search/model, financial
 * inference, publication-date guesses, off-site CDN trust or score admission. */
export async function discoverIssuerIndexLinks(domains:readonly string[],fetchImpl:typeof fetch=fetch) {
 const roots=domains.filter(domain=>/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)).slice(0,2);
 const trusted=(url:URL)=>url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&roots.some(root=>url.hostname===root||url.hostname.endsWith('.'+root));
 const diagnostics:{outcome:string;url:string;detail?:string}[]=[];
 const candidates=new Map<string,GroundedDocumentCandidate>();
 const visited=new Set<string>();
 const queue=roots.flatMap(root=>[{url:`https://${root}/`,priority:100},{url:`https://${root}/sitemap.xml`,priority:10}]);
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25_000);
 let requests=0;
 const priority=(value:string)=>/investor|financial|quarter|earnings|results/i.test(value)?80:/presentation|annual.report/i.test(value)?50:0;
 try {
  while(queue.length&&requests<8&&!controller.signal.aborted) {
   queue.sort((a,b)=>b.priority-a.priority);const item=queue.shift()!;
   let url=new URL(item.url);if(visited.has(url.href)||!trusted(url))continue;
   visited.add(url.href);requests++;
   try {
    const response=await fetchImpl(url.href,{redirect:'manual',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(6_000)]),headers:{Accept:'text/html,application/xml;q=0.9','User-Agent':'AlphaSynth-Official-Index/1.0'}});
    if(response.status>=300&&response.status<400){const next=new URL(response.headers.get('location')||'',url);await response.body?.cancel();if(trusted(next))queue.push({url:next.href,priority:item.priority});else diagnostics.push({outcome:'issuer_index_offsite_redirect_rejected',url:url.href});continue;}
    if(!response.ok){await response.body?.cancel();diagnostics.push({outcome:'issuer_index_http_error',url:url.href,detail:String(response.status)});continue;}
    if(response.url&&response.url!==url.href){await response.body?.cancel();diagnostics.push({outcome:'issuer_index_unexpected_redirect',url:url.href});continue;}
    if(Number(response.headers.get('content-length')||0)>1_000_000){await response.body?.cancel();continue;}
    const reader=response.body?.getReader();if(!reader)continue;
    const chunks:Uint8Array[]=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1_000_000){await reader.cancel();throw Error('index_size_limit');}chunks.push(value);}}finally{reader.releaseLock();}
    const html=Buffer.concat(chunks.map(chunk=>Buffer.from(chunk))).toString('utf8');
    const links=[...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].slice(0,500).map(match=>({href:match[1],label:match[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}));
    links.push(...[...html.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].slice(0,500).map(match=>({href:match[1],label:match[1]})));
    for(const link of links){
     try{
      const next=new URL(link.href.replace(/&amp;/g,'&'),url);next.hash='';if(!trusted(next))continue;
      const rank=priority(next.href+' '+link.label);if(!rank)continue;
      if(/\.pdf$/i.test(next.pathname)||/financial|quarter|earnings|results/i.test(next.pathname))candidates.set(next.href,{uri:next.href,title:link.label||'Issuer results link'});
      if(!/\.pdf$/i.test(next.pathname)&&!visited.has(next.href)&&queue.length<40)queue.push({url:next.href,priority:rank});
     }catch{/* Invalid or unrelated links have no source authority. */}
    }
    diagnostics.push({outcome:'issuer_index_scanned',url:url.href,detail:`${links.length} links inspected`});
   }catch(error){diagnostics.push({outcome:'issuer_index_fetch_failed',url:url.href,detail:error instanceof Error?error.message:String(error)});}
  }
 }finally{clearTimeout(timer);}
 return {candidates:[...candidates.values()].slice(0,16),diagnostics};
}
