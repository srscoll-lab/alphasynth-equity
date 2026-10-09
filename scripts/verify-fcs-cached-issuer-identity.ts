import assert from 'node:assert/strict';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {cachedIssuerIdentity} from '../src/fcs-cached-issuer-identity.ts';
const base=await mkdtemp(path.join(tmpdir(),'fcs-identity-'));
const bytes=Buffer.from('%PDF-fixture');const sha=createHash('sha256').update(bytes).digest('hex');
const entry={source_url:'https://www.sebi.gov.in/sebi_data/attachdocs/fixture.pdf',sha256:sha,identity_ticker:'FIXTURE',identity_company_name:'Fixture Limited'};
let calls=0;const options={base,fetchImpl:(async()=>{calls++;return new Response(bytes,{headers:{'content-type':'application/pdf'}});}) as typeof fetch,extractText:async()=> 'RED HERRING PROSPECTUS\nFixture Limited\nWebsite: www.fixture-company.in;\nCorporate Identity Number: L12345MH2000PLC123456'};
try {
 await writeFile(path.join(base,'manifest.json'),JSON.stringify({documents:[entry]}));
 assert.deepEqual((await cachedIssuerIdentity('FIXTURE','Fixture Limited',options)).domains,['fixture-company.in']);
 const before=calls;assert.deepEqual((await cachedIssuerIdentity('OTHER','Fixture Limited',options)).domains,[]);assert.equal(calls,before);
 assert.deepEqual((await cachedIssuerIdentity('FIXTURE','Other Limited',options)).domains,[]);
 await writeFile(path.join(base,'manifest.json'),JSON.stringify({documents:[{...entry,sha256:'0'.repeat(64)}]}));
 assert.deepEqual((await cachedIssuerIdentity('FIXTURE','Fixture Limited',options)).domains,[]);
 assert.deepEqual((await cachedIssuerIdentity('FIXTURE','Fixture Limited',{...options,extractText:async()=> 'Wrong document'})).domains,[]);
}finally{await unlink(path.join(base,'manifest.json'));await rmdir(base);}
console.log('Cached source identity: matching company/symbol, exact source hash and cover revalidation passed.');
