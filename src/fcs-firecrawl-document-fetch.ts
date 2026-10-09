/** Provider transport fallback. Only original PDF bytes are admitted; markdown,
 * screenshots and provider-generated interpretations cannot become originals. */
export function createFirecrawlDocumentFetch(options:{directFetch:typeof fetch;trustedIssuerDomains:readonly string[];scrape:(url:string,options:any)=>Promise<any>;maxCalls?:number}){
  let calls=0;
  const diagnostics:any[]=[];
  const responses=new Map<string,Response>();
  const hosts=[...options.trustedIssuerDomains,'nsearchives.nseindia.com','archives.nseindia.com','bseindia.com','nseindia.com','sebi.gov.in'];
  const allowed=(raw:string)=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/\.pdf$/i.test(u.pathname)&&hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}};
  const fetchImpl:typeof fetch=async(input,init)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const cached=responses.get(url);if(cached)return cached.clone();
    let direct:Response|undefined;
    try{direct=await options.directFetch(input,init);if(direct.ok||![403,429,502,503,504].includes(direct.status))return direct;}catch(error){if(!allowed(url))throw error;}
    if(!allowed(url)||calls>=Math.min(4,options.maxCalls??4)||init?.signal?.aborted)return direct||new Response(null,{status:503});
    calls++;
    try{
      const doc=await options.scrape(url,{formats:['rawBase64'],parsers:[],timeout:10000,proxy:'basic'});
      const finalUrl=String(doc?.metadata?.url||'');
      const encoded=doc?.rawBase64;
      if(doc?.metadata?.statusCode!==200||!allowed(finalUrl)||new URL(finalUrl).href!==new URL(url).href||!encoded||typeof encoded!=='string'||encoded.length>20*1024*1024)throw Error('Invalid original response');
      const bytes=Buffer.from(encoded,'base64');
      if(bytes.length<5||bytes.length>15*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF bytes');
      const response=new Response(bytes,{headers:{'content-type':'application/pdf','content-length':String(bytes.length)}});
      Object.defineProperty(response,'url',{value:finalUrl});
      // Require an unchanged final URL above: the retriever retains the
      // requested URL, including when Response.clone has no URL property.
      responses.set(url,response);
      diagnostics.push({outcome:'firecrawl_original_pdf_retrieved',sourceUrl:finalUrl,bytes:bytes.length,provider_credits:doc.metadata.creditsUsed??null});
      return response.clone();
    }catch{diagnostics.push({outcome:'firecrawl_original_pdf_unavailable',sourceUrl:url});return direct||new Response(null,{status:503});}
  };
  return {fetchImpl,diagnostics};
}
