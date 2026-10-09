import {retrieveGroundedFcsDocuments} from './fcs-grounded-document-retrieval.ts';
import {exchangeIssuerDomainHints,regulatorIssuerDomainHints} from './fcs-exchange-issuer-domain.ts';

/** A protected diagnostic/ingestion primitive. No model, score or job writes. */
export async function verifyDirectIssuerIdentity(input:{sourceUrl:string;ticker:string;companyName:string;fetchImpl?:typeof fetch;extractText?:(bytes:Uint8Array,pages?:number)=>Promise<string>}) {
 const url=new URL(input.sourceUrl);
 const hosts=['sebi.gov.in','www.sebi.gov.in','nseindia.com','www.nseindia.com','nsearchives.nseindia.com','archives.nseindia.com','bseindia.com','www.bseindia.com'];
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash
  ||!hosts.includes(url.hostname.toLowerCase())||!url.pathname.toLowerCase().endsWith('.pdf')
  ||! /^[A-Z0-9&.-]{1,24}$/.test(input.ticker)||input.companyName.trim().length<5) throw Error('Invalid official identity-source request.');
 const result=await retrieveGroundedFcsDocuments([{uri:url.href}],{trustedIssuerDomains:['sebi.gov.in'],maxDocuments:1,maxRequests:4,timeoutMs:25_000,maximumPages:3,fetchImpl:input.fetchImpl,extractText:input.extractText});
 const proofs=result.documents.flatMap(doc=>{
  const identity={documentUrl:doc.sourceUrl,documentText:doc.text,ticker:input.ticker,companyName:input.companyName};
  const domains=[...exchangeIssuerDomainHints(identity),...regulatorIssuerDomainHints(identity)];
  return domains.map(domain=>({domain,sourceUrl:doc.sourceUrl,sha256:doc.sha256,bytes:doc.byteLength}));
 });
 return {identityOnly:true,verified:proofs.length===1,proofs:proofs.length===1?proofs:[],documentsRetrieved:result.documents.length,diagnostics:result.diagnostics};
}
