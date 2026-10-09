import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { infosysQuarterIndex, sourcesFromInfosysIndex } from '../src/fundamental-review-official-index.ts';
const base = path.join(process.cwd(), 'data', 'official-quarter-cache');
await mkdir(base, { recursive:true });
let documents: any[] = [];
try { documents = JSON.parse(await readFile(path.join(base,'manifest.json'),'utf8')).documents; } catch {}
async function capture(source_url:string, media_type:string) {
  const response = await fetch(source_url, { signal:AbortSignal.timeout(20000) });
  if (!response.ok || new URL(response.url).hostname !== 'www.infosys.com') throw Error('Official acquisition failed: ' + source_url);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 20*1024*1024 || (media_type === 'application/pdf' && !bytes.subarray(0,5).equals(Buffer.from('%PDF-')))) throw Error('Invalid source bytes');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const previous = documents.find(item => item.source_url === source_url);
  if (previous && previous.sha256 !== sha256) throw Error('Existing immutable cache conflicts; explicit review required.');
  await writeFile(path.join(base,sha256 + (media_type === 'application/pdf' ? '.pdf' : '.html')),bytes,{flag:'wx'}).catch(async error=>{
    if (error.code !== 'EEXIST' || createHash('sha256').update(await readFile(path.join(base,sha256 + (media_type === 'application/pdf' ? '.pdf' : '.html')))).digest('hex') !== sha256) throw error;
  });
  if (!previous) documents.push({source_url,sha256,media_type,captured_at:new Date().toISOString(),acquisition_method:'direct_http'});
  return bytes;
}
for (const end of ['2024-12-31','2025-03-31','2025-06-30','2025-12-31','2026-03-31','2026-06-30']) {
  const index = infosysQuarterIndex(end)!;
  const html = (await capture(index,'text/html')).toString('utf8');
  const release = sourcesFromInfosysIndex(html,index,'2026-10-06').find(source=>source.url.endsWith('/ifrs-usd-press-release.pdf'));
  if (!release) throw Error('No cutoff-qualified issuer release: ' + end);
  await capture(release.url,'application/pdf');
  console.log(JSON.stringify({period:end,published_at:release.published_at,official_release_captured:true}));
}
await writeFile(path.join(base,'manifest.json'), JSON.stringify({schema_version:'1.0.0',documents},null,2));
console.log('Six official release originals and publication-date index originals captured; no model calls.');
