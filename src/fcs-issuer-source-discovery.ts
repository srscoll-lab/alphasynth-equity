import {retrieveGroundedFcsDocuments,type GroundedDocumentCandidate,type RetrievalDiagnostic} from './fcs-grounded-document-retrieval.ts';
import {exchangeIssuerDomainHints,regulatorIssuerDomainHints} from './fcs-exchange-issuer-domain.ts';
/** Resolve source identity before financial research. Search output is a hint,
 * never issuer authentication: only matching downloaded exchange covers admit a domain.
 */
export async function discoverFcsIssuerDomains(input:{ticker:string;companyName:string;search:(instruction:string)=>Promise<GroundedDocumentCandidate[]>;fetchImpl?:typeof fetch;extractText?: (data:Uint8Array,pages?:number)=>Promise<string>}) {
 const diagnostics:Array<RetrievalDiagnostic|Record<string,unknown>>=[];
 try {
  const refs=await input.search(`Identify the issuer website for ${input.companyName} (NSE symbol ${input.ticker}) from a dated official NSE/BSE exchange filing. Search using site:nsearchives.nseindia.com "${input.companyName}" "${input.ticker}" "Website" and site:bseindia.com "${input.companyName}" "Website". Find the issuer's own cover letter with its full name, exact NSE Symbol/Code and explicit Website field. Return official exchange PDF references only. Do not research financial numbers or cite brokers, news, social sites or directories.`);
  const result=await retrieveGroundedFcsDocuments(refs,{trustedIssuerDomains:[],maxDocuments:3,maxRequests:12,timeoutMs:25_000,maximumPages:3,fetchImpl:input.fetchImpl,extractText:input.extractText});
  diagnostics.push(...result.diagnostics);
  let domains=[...new Set(result.documents.flatMap(doc=>exchangeIssuerDomainHints({documentUrl:doc.sourceUrl,documentText:doc.text,ticker:input.ticker,companyName:input.companyName})))];
  diagnostics.push({outcome:'issuer_metadata_discovery',reference_count:refs.length,exchange_document_count:result.documents.length,verified_domain_count:domains.length});
  if(!domains.length) {
   const regulatorRefs=await input.search(`Find the official SEBI-hosted prospectus PDF for the exact legal issuer ${input.companyName}. Search site:sebi.gov.in/sebi_data/attachdocs "${input.companyName}" "Website" "Corporate Identity Number". Return direct SEBI PDF references only, not news or brokers. This is identity verification, not financial research; no financial figures are needed.`);
   const regulator=await retrieveGroundedFcsDocuments([...regulatorRefs,...refs],{trustedIssuerDomains:['sebi.gov.in'],maxDocuments:2,maxRequests:12,timeoutMs:25_000,maximumPages:3,fetchImpl:input.fetchImpl,extractText:input.extractText});
   diagnostics.push(...regulator.diagnostics);
   domains=[...new Set(regulator.documents.flatMap(doc=>regulatorIssuerDomainHints({documentUrl:doc.sourceUrl,documentText:doc.text,ticker:input.ticker,companyName:input.companyName})))];
   if(domains.length!==1)domains=[];
   diagnostics.push({outcome:'regulator_issuer_metadata_discovery',reference_count:regulatorRefs.length,document_count:regulator.documents.length,verified_domain_count:domains.length,
    identity_sources:regulator.documents.map(doc=>({url:doc.sourceUrl,sha256:doc.sha256}))});
  }
  return {domains,diagnostics};
 }catch(error){
  diagnostics.push({outcome:'issuer_metadata_discovery_failed',detail:error instanceof Error?error.message:String(error)});
  return {domains:[] as string[],diagnostics};
 }
}
