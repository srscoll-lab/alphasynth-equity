import assert from 'node:assert/strict';
import {verifyDirectIssuerIdentity} from '../src/fcs-direct-issuer-identity.ts';
let calls=0;
const input={sourceUrl:'https://www.sebi.gov.in/sebi_data/attachdocs/fixture.pdf',ticker:'FIXTURE',companyName:'Fixture Limited',fetchImpl:(async()=>{calls++;return new Response('%PDF-fixture',{headers:{'content-type':'application/pdf'}});}) as typeof fetch,
 extractText:async()=> 'RED HERRING PROSPECTUS\nFixture Limited\nWebsite: www.fixture-company.in;\nCorporate Identity Number: L12345MH2000PLC123456'};
const good=await verifyDirectIssuerIdentity(input);assert.equal(good.verified,true);assert.equal(good.proofs[0].domain,'fixture-company.in');
const wrong=await verifyDirectIssuerIdentity({...input,companyName:'Other Limited'});assert.equal(wrong.verified,false);
for(const sourceUrl of ['https://www.sebi.gov.in.evil.com/fixture.pdf','https://user@www.sebi.gov.in/fixture.pdf','https://www.sebi.gov.in:8443/fixture.pdf','https://vertexaisearch.cloud.google.com/grounding-api-redirect/fixture.pdf','https://127.0.0.1/fixture.pdf','http://www.sebi.gov.in/fixture.pdf']) {
 const before=calls;await assert.rejects(verifyDirectIssuerIdentity({...input,sourceUrl}));assert.equal(calls,before);
}
console.log('Direct issuer identity: exact official origins, identity validation and no unsafe-network requests passed.');
