import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {verifyDirectIssuerIdentity} from './fcs-direct-issuer-identity.ts';
import {officialDocumentFetch} from './official-document-cache.ts';
/** Private reviewed source catalogue. Stored domain assertions are never trusted;
 * re-read/hash-check the original and rerun cover validation before use. */
export async function cachedIssuerIdentity(ticker:string,companyName:string,options:{base?:string;fetchImpl?:typeof fetch;extractText?:(bytes:Uint8Array,pages?:number)=>Promise<string>}={}) {
 const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 try {
  const manifest=JSON.parse(await readFile(path.join(options.base||path.join(process.cwd(),'data','official-quarter-cache'),'manifest.json'),'utf8'));
  const entries=manifest.documents.filter((entry:any)=>entry.identity_ticker===ticker&&normalize(String(entry.identity_company_name||''))===normalize(companyName)&&/^[a-f0-9]{64}$/.test(entry.sha256)).slice(0,2);
  for(const entry of entries) {
   const result=await verifyDirectIssuerIdentity({ticker,companyName,sourceUrl:entry.source_url,fetchImpl:options.fetchImpl||officialDocumentFetch,extractText:options.extractText});
   if(result.verified&&result.proofs[0].sha256===entry.sha256)return {domains:result.proofs.map(p=>p.domain),proofs:result.proofs};
  }
 }catch{/* A missing/broken catalogue is not proof of issuer identity. */}
 return {domains:[] as string[],proofs:[] as {domain:string;sourceUrl:string;sha256:string;bytes:number}[]};
}
