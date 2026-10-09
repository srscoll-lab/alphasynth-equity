import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { larsenQuarterHighlights } from '../src/larsen-quarter-highlights.ts';
import { sourcesFromLarsenIndexes } from '../src/fundamental-review-official-index.ts';
import { extractPdfTextLocally } from '../src/pdf-text.ts';
const base='data/official-quarter-cache/';
const manifest=JSON.parse(readFileSync(base+'manifest.json','utf8'));
const original=(url:string)=>{
  const entry=manifest.documents.find((item:any)=>item.source_url===url);
  assert.ok(entry);
  const bytes=readFileSync(base+entry.sha256+(entry.media_type==='application/pdf'?'.pdf':'.html'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  return bytes;
};
const downloads=original('https://investors.larsentoubro.com/download.aspx').toString();
const events=original('https://investors.larsentoubro.com/Events.aspx').toString();
const expected:Record<string,number[][]>={
 '2025-12-31':[[647,714],[9.7,10.4],[1160,1356],[21,79]],
 '2026-03-31':[[744,828],[11,10.4],[896,898],[107,171]],
 '2026-06-30':[[637,679],[9.9,9],[945,1080],[58,43]],
};
for(const [end,values] of Object.entries(expected)) {
 const sources=sourcesFromLarsenIndexes(downloads,events,end,'2026-10-07');
 assert.equal(sources.length,1);
 const text=await extractPdfTextLocally(original(sources[0].url),40);
 const comparisons=larsenQuarterHighlights(text,end,sources[0].published_at);
 assert.ok(comparisons);
 assert.deepEqual(comparisons.map(row=>[row.previous,row.current]),values);
 assert.equal(larsenQuarterHighlights(text,end,'2026-10-07'),null,'Capture date cannot replace publication');
 assert.equal(larsenQuarterHighlights(text,end.replace('2026','2024').replace('2025','2024'),sources[0].published_at),null);
 assert.equal(larsenQuarterHighlights(text.replaceAll('Key Financial Indicators','Annual summary'),end,sources[0].published_at),null);
 assert.equal(larsenQuarterHighlights(text.replace(/Financ\s*ial\s+Servic\s*es\s+business/gi,'all business'),end,sources[0].published_at),null);
 assert.equal(larsenQuarterHighlights(text+'\n\n'+text,end,sources[0].published_at),null,'Ambiguous duplicated table fails');
 console.log(JSON.stringify({period:end,published:sources[0].published_at,comparisons}));
}
console.log('Three real issuer PDFs: hashes, quarterly/cumulative separation, publication dates, scope and ambiguity passed. No model calls.');
