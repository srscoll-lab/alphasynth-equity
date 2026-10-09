import assert from 'node:assert/strict';
import {retrieveGroundedFcsDocuments} from '../src/fcs-grounded-document-retrieval.ts';
import {regulatorIssuerDomainHints} from '../src/fcs-exchange-issuer-domain.ts';
// Read-only acceptance of real public cover metadata, not admission of financial numbers.
const result=await retrieveGroundedFcsDocuments([{uri:'https://www.sebi.gov.in/sebi_data/attachdocs/1445319248511.pdf'}],{
 trustedIssuerDomains:['sebi.gov.in'],maximumPages:3,maxDocuments:1,maxRequests:3,timeoutMs:30_000,
});
const doc=result.documents[0];
assert.ok(doc,JSON.stringify(result.diagnostics));
const domains=regulatorIssuerDomainHints({documentUrl:doc.sourceUrl,documentText:doc.text,companyName:'InterGlobe Aviation Limited',ticker:'INDIGO'});
assert.deepEqual(domains,['goindigo.in']);
console.log(JSON.stringify({identity_only:true,domains,source:doc.sourceUrl,sha256:doc.sha256,bytes:doc.byteLength}));
