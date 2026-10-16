/** Provider transport fallback. PDF bytes or raw HTML from the exact requested
 * official URL may be admitted; markdown and model interpretations may not. */
export function createFirecrawlDocumentFetch(options:{directFetch:typeof fetch;trustedIssuerDomains:readonly string[];scrape:(url:string,options:any)=>Promise<any>;maxCalls?:number}){
  let calls=0;
  const diagnostics:any[]=[];
  const responses=new Map<string,Response>();
  const hosts=[...options.trustedIssuerDomains,'nsearchives.nseindia.com','archives.nseindia.com','bseindia.com','nseindia.com','sebi.gov.in'];
  const allowedPdf=(raw:string)=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/\.pdf$/i.test(u.pathname)&&hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}};
  const allowedNseHtml=(raw:string)=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname==='nsearchives.nseindia.com'&&/^\/corporate\/ixbrl\/[^/]+\.html$/i.test(u.pathname);}catch{return false;}};
  const allowed=(raw:string)=>allowedPdf(raw)||allowedNseHtml(raw);
  const fetchImpl:typeof fetch=async(input,init)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const cached=responses.get(url);if(cached)return cached.clone();
    let direct:Response|undefined;
    try{direct=await options.directFetch(input,init);if(direct.ok||![403,429,502,503,504].includes(direct.status))return direct;}catch(error){if(!allowed(url))throw error;}
    if(!allowed(url)||calls>=Math.min(4,options.maxCalls??4)||init?.signal?.aborted)return direct||new Response(null,{status:503});
    calls++;
    try{
      const isHtml=allowedNseHtml(url);
      const doc=await options.scrape(url,isHtml
        ? {formats:['rawHtml'],onlyMainContent:false,timeout:12000,proxy:'auto',storeInCache:false}
        : {formats:['rawBase64'],parsers:[],timeout:10000,proxy:'basic'});
      const finalUrl=String(doc?.metadata?.url||doc?.metadata?.sourceURL||'');
      if(doc?.metadata?.statusCode!==200||!allowed(finalUrl)||new URL(finalUrl).href!==new URL(url).href)throw Error('Invalid original response');
      const raw=isHtml?doc?.rawHtml:doc?.rawBase64;
      if(typeof raw!=='string'||!raw||raw.length>(isHtml?1024*1024:20*1024*1024))throw Error('Missing original content');
      const bytes=isHtml?Buffer.from(raw,'utf8'):Buffer.from(raw,'base64');
      if(isHtml
        ? (bytes.length<500||bytes.length>1024*1024||!/<html\b/i.test(raw)||!/NSE\s*Symbol/i.test(raw)||!/Integrated\s+Filing/i.test(raw))
        : (bytes.length<5||bytes.length>15*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-'))throw Error('Invalid original content');
      const response=new Response(bytes,{headers:{'content-type':isHtml?'text/html':'application/pdf','content-length':String(bytes.length)}});
      Object.defineProperty(response,'url',{value:finalUrl});
      // Require an unchanged final URL above: the retriever retains the
      // requested URL, including when Response.clone has no URL property.
      responses.set(url,response);
      diagnostics.push({outcome:isHtml?'firecrawl_raw_official_html_retrieved':'firecrawl_original_pdf_retrieved',sourceUrl:finalUrl,bytes:bytes.length,provider_credits:doc.metadata.creditsUsed??null});
      return response.clone();
    }catch{diagnostics.push({outcome:'firecrawl_original_pdf_unavailable',sourceUrl:url});return direct||new Response(null,{status:503});}
  };
  return {fetchImpl,diagnostics};
}
