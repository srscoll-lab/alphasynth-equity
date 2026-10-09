import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hclQuarterHighlights} from '../src/hcl-quarter-highlights.ts';
import {hclReleaseFromIndex,hclCoverDate,HCL_QUARTER_INDEX} from '../src/hcl-quarter-index.ts';
import {cachedOfficialDocument,officialDocumentFetch} from '../src/official-document-cache.ts';
import {discoverIndexedOfficialSources} from '../src/fundamental-review-official-index.ts';
const html=(await cachedOfficialDocument(HCL_QUARTER_INDEX))!.bytes.toString();
const expected:Record<string,number[]>={
 '2024-12-31':[3532.9,19.5,2095,27707], '2025-03-31':[3498.2,17.9,2995,28652],
 '2025-06-30':[3545,16.3,1812,27343], '2025-12-31':[3793,18.6,3006,31939],
 '2026-03-31':[3682,16.5,1936,33288], '2026-06-30':[3650,16.9,2407,26907],
};
for(const end of ['2024-12-31','2025-03-31','2025-06-30','2025-12-31','2026-03-31','2026-06-30']) {
 const source=(await discoverIndexedOfficialSources('HCLTECH',end,'2026-10-07',officialDocumentFetch))[0];assert.ok(source);
 assert.equal(source.url,hclReleaseFromIndex(html,end));
 const text=readFileSync(`tmp/hcl-history/${end}.txt`,'utf8');
 const parsed=hclQuarterHighlights(text,end,source.published_at);
 assert.ok(parsed,`Quarter table rejected: ${end}`);
 assert.deepEqual(['revenue','operating_margin','deal_tcv','net_cash'].map(metric=>parsed[metric].value),expected[end]);
 assert.equal(hclQuarterHighlights(text,end,'2026-10-07'),null);
 assert.equal(hclQuarterHighlights(text+'\n\n'+text,end,source.published_at),null);
 assert.equal(hclQuarterHighlights(text.replaceAll('Consolidated Income Statement','Standalone Income Statement'),end,source.published_at),null);
 assert.equal(hclQuarterHighlights(text.replaceAll('Quarter Ended','Year Ended').replaceAll('Quarter ended','Year ended'),end,source.published_at),null);
 console.log(JSON.stringify({period:end,published:source.published_at,highlights:parsed}));
}
assert.equal(hclCoverDate('Q1 FY27 Investor Release July 13, 2026 quarter ended June 30, 2026','2026-06-30'),'2026-07-13');
assert.equal(hclCoverDate('Q1 FY27 Investor Release July 13, 2026 Investor Release July 14, 2026','2026-06-30'),null);
console.log('Six HCL source covers and quarterly tables passed. Local verification only, no publication or model calls.');
