import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rankSourcesForTargetPeriod } from "../src/fcs-target-source-ranking.ts";
import { retrieveGroundedFcsDocuments } from "../src/fcs-grounded-document-retrieval.ts";

// Shaped like the 19 Oct Solar Industries source list (Tapetide-dated links,
// undated Firecrawl hints). Order is the provider's newest-first order.
const sources = [
  { url: "https://www.bseindia.com/xml-data/corpfiling/AttachHis/jun-presentation.pdf", published_at: "2026-08-14" },
  { url: "https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_INDAS_186457_13082026161339_iXBRL_WEB.html", published_at: "2026-08-13" },
  { url: "https://www.bseindia.com/xml-data/corpfiling/AttachHis/jun-results.pdf", published_at: "2026-08-13" },
  { url: "https://www.bseindia.com/xml-data/corpfiling/AttachHis/a8bee741-mar-results.pdf", published_at: "2026-05-15" },
  { url: "https://www.bseindia.com/xml-data/corpfiling/AttachHis/421138f2-mar-results.pdf", published_at: "2026-05-15" },
  { url: "https://nsearchives.nseindia.com/corporate/SOLARINDS_29012022162434_presentation.pdf", published_at: "2022-01-29" },
  { url: "https://www.solargroup.com/investors/undated-hint.pdf", published_at: null },
];
const order = (target?: string) => rankSourcesForTargetPeriod(sources, target).map((source) => source.url.split("/").pop());

// March balance-sheet target: the two 15 May March results lead; June filings fall behind.
assert.deepEqual(order("2026-03-31").slice(0, 3), ["a8bee741-mar-results.pdf", "421138f2-mar-results.pdf", "undated-hint.pdf"]);
assert.ok(order("2026-03-31").indexOf("jun-results.pdf") > order("2026-03-31").indexOf("undated-hint.pdf"));
// June quarter target: iXBRL first within the August window, then the other June filings.
assert.deepEqual(order("2026-06-30").slice(0, 3),
  ["INTEGRATED_FILING_INDAS_186457_13082026161339_iXBRL_WEB.html", "jun-presentation.pdf", "jun-results.pdf"]);
assert.equal(order("2026-06-30").at(-1), "SOLARINDS_29012022162434_presentation.pdf");
// No target: previous behaviour (iXBRL first, otherwise unchanged order).
assert.deepEqual(order(), ["INTEGRATED_FILING_INDAS_186457_13082026161339_iXBRL_WEB.html", "jun-presentation.pdf", "jun-results.pdf",
  "a8bee741-mar-results.pdf", "421138f2-mar-results.pdf", "SOLARINDS_29012022162434_presentation.pdf", "undated-hint.pdf"]);
// A document published on the period end itself is not in the results window.
assert.equal(rankSourcesForTargetPeriod([{ url: "https://x/a", published_at: "2026-03-31" }, { url: "https://x/b", published_at: "2026-04-20" }],
  "2026-03-31")[0].url, "https://x/b");

// Byte limit through the real retrieval module, with no network.
const bigPdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(Math.round(15.8 * 1024 * 1024), 32)]);
const fakeFetch = (async () => new Response(bigPdf, { status: 200, headers: {
  "content-type": "application/pdf", "content-length": String(bigPdf.length) } })) as unknown as typeof fetch;
const candidate = [{ uri: "https://www.bseindia.com/xml-data/corpfiling/AttachHis/a8bee741-mar-results.pdf", title: "Q4 FY26 results" }];
const extractText = async () => "Statement of Assets and Liabilities as at 31.03.2026 Total Equity 9259.10 4800.88 Financial Results quarter ended revenue";
const defaults = await retrieveGroundedFcsDocuments(candidate, { trustedIssuerDomains: [], fetchImpl: fakeFetch, extractText });
assert.equal(defaults.documents.length, 0, "old 8 MB default skips a 15.8 MB results filing");
assert.ok(defaults.diagnostics.some((d) => /bytes_exceeded/.test(d.code)), JSON.stringify(defaults.diagnostics));
const raised = await retrieveGroundedFcsDocuments(candidate, { trustedIssuerDomains: [], fetchImpl: fakeFetch, extractText,
  maxDocumentBytes: 20 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024 });
assert.equal(raised.documents.length, 1, JSON.stringify(raised.diagnostics));

// The server passes the raised limits to both retrieval calls and carries the segment rule.
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
assert.equal((server.match(/maxDocumentBytes:20\*1024\*1024,maxTotalBytes:64\*1024\*1024/g) || []).length, 2);
assert.ok(server.includes("never use a Total, consolidated or company-wide revenue row as segment_revenue"));
assert.ok(server.includes("rankSourcesForTargetPeriod(groundedSources, targetPeriodEnd)"));

console.log("FCS target-period source ranking, 20 MB results filings and segment-row rule verified offline.");
