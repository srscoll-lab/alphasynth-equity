import assert from 'node:assert/strict';
import {createFirecrawlDocumentFetch} from '../src/fcs-firecrawl-document-fetch.ts';
const url='https://issuer.example/results.pdf';let calls=0;
const transport=createFirecrawlDocumentFetch({directFetch:async()=>new Response(null,{status:403}),trustedIssuerDomains:['issuer.example'],maxCalls:1,scrape:async(source,options)=>{
  calls++;assert.deepEqual(options.parsers,[]);assert.deepEqual(options.formats,['rawBase64']);assert.equal(options.proxy,'basic');
  return {rawBase64:Buffer.from('%PDF-original').toString('base64'),metadata:{url:source,statusCode:200,creditsUsed:1}};
}});
assert.equal(await (await transport.fetchImpl(url)).text(),'%PDF-original');
assert.equal(await (await transport.fetchImpl(url)).text(),'%PDF-original');assert.equal(calls,1);
assert.equal((await transport.fetchImpl('https://issuer.example/second.pdf')).status,403);
assert.equal((await transport.fetchImpl('https://issuer.example.evil.com/results.pdf')).status,403);
const mismatch=createFirecrawlDocumentFetch({directFetch:async()=>new Response(null,{status:403}),trustedIssuerDomains:['issuer.example'],scrape:async()=>({rawBase64:Buffer.from('%PDF-original').toString('base64'),metadata:{url:'https://issuer.example/other.pdf',statusCode:200}})});
assert.equal((await mismatch.fetchImpl(url)).status,403);
const html=createFirecrawlDocumentFetch({directFetch:async()=>new Response(null,{status:403}),trustedIssuerDomains:['issuer.example'],scrape:async()=>({rawBase64:Buffer.from('<html>error</html>').toString('base64'),metadata:{url,statusCode:200}})});
assert.equal((await html.fetchImpl(url)).status,403);
console.log('Original PDF transport: byte preservation, bounded calls, cache, spoofed hosts, changed source and HTML rejection passed.');
