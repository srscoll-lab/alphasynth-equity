import type {GroundedDocumentCandidate} from './fcs-grounded-document-retrieval.ts';
/** Model text may contain a direct official URL absent from grounding chunks.
 * These are untrusted discovery hints; downloaded cover identity is mandatory. */
export function metadataSourceCandidates(text: string,trustedIssuerDomains:readonly string[]=[]): GroundedDocumentCandidate[] {
 const candidates=new Map<string,GroundedDocumentCandidate>();
 for(const match of text.slice(0,24_000).matchAll(/https:\/\/[^\s<>"']+/gi)) {
  try {
   let url=new URL(match[0].replace(/[),.;\]*]+$/g,''));
   if(url.username||url.password||url.port)continue;
   const host=url.hostname.toLowerCase();
   const issuerMatch=trustedIssuerDomains.some(domain=>/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)&&(host===domain||host.endsWith('.'+domain)));
   if(!['www.sebi.gov.in','sebi.gov.in','www.nseindia.com','nseindia.com','nsearchives.nseindia.com','archives.nseindia.com','www.bseindia.com','bseindia.com'].includes(host)&&!issuerMatch)continue;
   if(['www.sebi.gov.in','sebi.gov.in'].includes(url.hostname.toLowerCase())&&url.pathname==='/web/') {
    const file=url.searchParams.get('file');
    if(file&&/^\/(?:cms\/)?sebi_data\/attachdocs\/[^/]+\.pdf$/i.test(file))url=new URL(file,url.origin);
   }
   url.hash='';candidates.set(url.href,{uri:url.href,title:'Unverified official identity source hint'});
   if(candidates.size>=12)break;
  }catch{/* A malformed model URL is not evidence. */}
 }
 return [...candidates.values()];
}
