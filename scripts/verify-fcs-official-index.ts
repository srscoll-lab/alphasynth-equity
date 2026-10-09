import assert from "node:assert/strict";
import { infosysQuarterIndex, sourcesFromInfosysIndex, sourcesFromLarsenIndexes, discoverIndexedOfficialSources } from "../src/fundamental-review-official-index.ts";
import { containsReportedNumber, containsReportingPeriod } from "../src/fundamental-review-source-match.ts";
const index = infosysQuarterIndex("2026-03-31")!;
assert.ok(index.endsWith("2025-2026/q4.html"));
assert.ok(infosysQuarterIndex("2026-06-30")!.endsWith("2026-2027/q1.html"));
assert.equal(infosysQuarterIndex("2026-03-30"), null);
const html = `Infosys announces results for the fourth quarter and year ended March 31, 2026 on Thursday, April 23, 2026.
<a href="q4/documents/ifrs-usd-press-release.pdf">USD</a>
<a href="https://evil.example/documents/fact-sheet.pdf">Other site</a>`;
const sources = sourcesFromInfosysIndex(html, index, "2026-10-06");
assert.equal(sources.length, 1);
assert.equal(sources[0].published_at, "2026-04-23");
assert.equal(sourcesFromInfosysIndex(html, index, "2026-04-22").length, 0);
assert.equal(sourcesFromInfosysIndex(html.replace("announces results", "financial information"), index, "2026-10-06").length, 0);
console.log("Official quarterly index: fiscal-year mapping, publication cutoff and issuer allowlist passed.");
assert.ok(containsReportedNumber("Revenue 58,390; margin 13.30%", 58390));
assert.ok(containsReportedNumber("margin 13.30%", 13.3));
assert.equal(containsReportedNumber("margin 1.33%; 113.3; 13", 13.3), false);
assert.ok(containsReportingPeriod("Quarter ended March 31, 2026", "Q4 FY26", "2026-03-31"));
assert.equal(containsReportingPeriod("March 31, 2025", "Q4 FY26", "2026-03-31"), false);
console.log("Exact source-number and reporting-period verification passed.");
const ltDownloads = `<a onclick="return fnDownloadpdf('https://investors.larsentoubro.com/upload/AnalystPres/FY2027AnalystPresL&T Q1FY27 Analyst Presentation.pdf');">Q1</a>
<a onclick="return fnDownloadpdf('https://evil.example/upload/AnalystPres/FY2027AnalystPresQ1FY27.pdf');">Wrong issuer</a>
<a onclick="return fnDownloadpdf('https://investors.larsentoubro.com/upload/AnnualRep/FY2027AnnualReport.pdf');">Annual</a>`;
const ltEvents = `<tr><td><span id="gridCorporate_lblResultDate_0">28/07/2026</span></td><td><span id="gridCorporate_lblTitle_0">First Quarter Results</span></td></tr>`;
assert.equal(sourcesFromLarsenIndexes(ltDownloads,ltEvents,'2026-06-30','2026-07-27').length,0);
const ltSources = sourcesFromLarsenIndexes(ltDownloads,ltEvents,'2026-06-30','2026-10-07');
assert.equal(ltSources.length,1);
assert.equal(ltSources[0].published_at,'2026-07-28');
assert.equal(ltSources[0].period_end,'2026-06-30');
assert.equal(sourcesFromLarsenIndexes(ltDownloads,ltEvents,'2025-06-30','2026-10-07').length,0);
assert.equal(sourcesFromLarsenIndexes(ltDownloads,ltEvents.replace('First Quarter Results','Investor conference'),'2026-06-30','2026-10-07').length,0);
assert.equal(sourcesFromLarsenIndexes(ltDownloads,ltEvents+ltEvents.replace('28/07/2026','29/07/2026'),'2026-06-30','2026-10-07').length,0);
let indexFetches=0;
const mockFetch = (async (url: string) => {indexFetches++; return new Response(url.includes('Events')?ltEvents:ltDownloads);}) as typeof fetch;
assert.equal((await discoverIndexedOfficialSources('LT','','2026-10-07',mockFetch))[0].period_end,'2026-06-30');
assert.equal(indexFetches,2,'September-to-June fallback reuses two index fetches');
const deniedFetch = (async ()=>new Response('',{status:403})) as typeof fetch;
assert.deepEqual(await discoverIndexedOfficialSources('LT','2026-06-30','2026-10-07',deniedFetch),[]);
console.log('L&T issuer fallback: event dates, quarter identity, domain allowlist, ambiguity, cutoff and bounded discovery passed.');
