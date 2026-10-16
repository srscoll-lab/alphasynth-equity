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
const nseUrl='https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_INDAS_123_iXBRL_WEB.html';
const rawHtml='<html><body>Integrated Filing — IndAS NSE Symbol SOLARINDS '+ 'Financial Results Ind-AS '.repeat(30)+'</body></html>';
let htmlCalls=0;
const nse=createFirecrawlDocumentFetch({directFetch:async()=>new Response(null,{status:403}),trustedIssuerDomains:[],scrape:async(source,options)=>{
  htmlCalls++;assert.equal(source,nseUrl);assert.deepEqual(options.formats,['rawHtml']);assert.equal(options.onlyMainContent,false);
  return {rawHtml,metadata:{url:source,statusCode:200}};
}});
const response=await nse.fetchImpl(nseUrl);
assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'text/html');assert.equal(await response.text(),rawHtml);
assert.equal((await nse.fetchImpl(nseUrl)).status,200);assert.equal(htmlCalls,1);
const wrongPage=createFirecrawlDocumentFetch({directFetch:async()=>new Response(null,{status:403}),trustedIssuerDomains:[],scrape:async()=>({rawHtml,metadata:{url:nseUrl.replace('_123_','_124_'),statusCode:200}})});
assert.equal((await wrongPage.fetchImpl(nseUrl)).status,403);
console.log('Official transport: PDF bytes, exact-URL NSE raw HTML, bounded calls, cache and spoof rejection passed.');
