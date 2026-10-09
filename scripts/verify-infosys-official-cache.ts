import assert from 'node:assert/strict';
import { discoverIndexedOfficialSources } from '../src/fundamental-review-official-index.ts';
import { cachedOfficialDocument, officialDocumentFetch } from '../src/official-document-cache.ts';
import { extractPdfTextLocally } from '../src/pdf-text.ts';
import { infosysQuarterHighlights } from '../src/infosys-quarter-highlights.ts';
const expected: Record<string,number[]> = {
 '2024-12-31':[4939,21.3,1263,2.5], '2025-03-31':[4730,21,892,2.6],
 '2025-06-30':[4941,20.8,884,3.8], '2025-12-31':[5099,18.4,915,4.8],
 '2026-03-31':[5040,20.9,833,3.2], '2026-06-30':[5082,21.1,955,3.6]
};
for (const [end,values] of Object.entries(expected)) {
 const sources = await discoverIndexedOfficialSources('INFY',end,'2026-10-06',officialDocumentFetch);
 const source = sources.find(item=>item.url.endsWith('ifrs-usd-press-release.pdf'))!;
 const cache = await cachedOfficialDocument(source.url);
 assert.ok(cache);
 const parsed = infosysQuarterHighlights(await extractPdfTextLocally(cache.bytes,40),end)!;
 assert.ok(parsed);
 assert.deepEqual([parsed.revenue,parsed.operating_margin,parsed.free_cash_flow,parsed.deal_tcv],values);
 console.log(JSON.stringify({period:end,published_at:source.published_at,verified_quarterly_highlights:parsed}));
}
assert.equal(await cachedOfficialDocument('https://example.com/pretend.pdf'), null);
assert.equal((await discoverIndexedOfficialSources('INFY','2026-06-30','2026-07-22',officialDocumentFetch)).length,0);
console.log('Six original PDFs, URL/hash checks and publication cutoff passed. No model calls.');
