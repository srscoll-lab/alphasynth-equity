import assert from 'node:assert/strict';
import {discoverFirecrawlFcsSources} from '../src/fcs-firecrawl-discovery.ts';
let calls=0;
const input={ticker:'TEST',companyName:'Test Limited',cutoff:'2026-10-08',trustedIssuerDomains:['issuer.example'],search:async(_query:string,options:any)=>{
  calls++;assert.equal(options.limit,8);assert.equal(options.scrapeOptions,undefined);
  return {web:[{url:'https://issuer.example/investors',description:'https://issuer.example/2024/results.pdf '+ 'x'.repeat(25000)+' [Latest](https://issuer.example/2026/results.pdf) https://issuer.example.evil.com/fake.pdf https://user:pw@issuer.example/private.pdf https://issuer.example:8443/private.pdf'}]};
}};
const first=await discoverFirecrawlFcsSources(input);
assert.equal(first.candidates[0].uri,'https://issuer.example/2026/results.pdf');
assert.equal(first.candidates.length,3);
await discoverFirecrawlFcsSources(input);assert.equal(calls,1);
const failed=await discoverFirecrawlFcsSources({...input,ticker:'FAIL',search:async()=>{throw Error('secret provider details');}});
assert.equal(failed.candidates.length,0);assert(!JSON.stringify(failed).includes('secret'));
console.log('Firecrawl discovery: bounded search, late index links, host validation, ordering, cache and safe failure passed.');
