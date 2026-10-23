import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fetchTapetideAnnualBalanceSheet, fetchTapetideQuarterlyFinancials, financialObservationsFromPayload, isBorrowingsRow,
  isTapetideQuotaMessage, TapetideMcpClient } from "../src/tapetide-fcs-provider.ts";
import { tapetideBalanceSheetEvidence } from "../src/tapetide-fcs-balance-sheet.ts";
import { documentsFromListing, isUsableMarkdown, resultsWindowDocuments, tapetideExecutionEvidence, textFromReadDocument,
  textSupportsComparison } from "../src/tapetide-fcs-documents.ts";
import { mergeProviderEvidence, tapetideCanonicalEvidence } from "../src/tapetide-fcs-evidence.ts";
import { assessLifecycle, checkpointFromScore, latestMarchOnOrBefore, mergeCheckpoint, type FcsCheckpoint } from "../src/fundamental-review-history.ts";
// @ts-ignore Plain ESM scorer in the sibling repository.
import { scoreFundamentalChangeReview as scorer } from "../../alphasynth-bms-v2/src/fcs-review-scorer.mjs";
const score = scorer as unknown as (input: Record<string, unknown>) => Record<string, any>;
const CUTOFF = "2026-10-21";

// 1. Quota limit is an error, never "no data" (the real 21 Oct message).
const quotaText = "You've reached the Tapetide free tier limit for today. Your access resets in about 12 hours (at 2026-10-22 00:00:00 IST). You're currently on the Free plan (50 MCP tool calls/day).";
assert.equal(isTapetideQuotaMessage(quotaText), true);
assert.equal(isTapetideQuotaMessage("Revenue rose 12%"), false);
const mcpFetch = (toolResult: (name: string, args: any) => unknown) => (async (_url: string, init: any) => {
  const body = JSON.parse(init.body);
  if (body.method !== "tools/call") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), { status: 200, headers: { "mcp-session-id": "s1" } });
  const value = toolResult(body.params.name, body.params.arguments);
  return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }] } });
}) as unknown as typeof fetch;
process.env.TAPETIDE_TOKEN = "test-token-not-real";
const exhausted = await fetchTapetideQuarterlyFinancials({ symbol: "EICHERMOT", client: new TapetideMcpClient({ fetchImpl: mcpFetch(() => quotaText) }) });
assert.equal(exhausted.diagnostics[0].outcome, "tapetide_quota_exhausted");
TapetideMcpClient.resetQuotaLatch();   // later sections start after the daily reset
assert.equal(exhausted.observations.length, 0);

// 2. Annual balance sheet (screener-style shape): Borrowings only, latest March on/before the quarter.
const bsPayload = { data: { section: "balance_sheet", periods: ["Mar 2023", "Mar 2024", "Mar 2025", "Mar 2026"],
  data: { "Equity Capital": { "Mar 2025": 27, "Mar 2026": 27 }, Reserves: { "Mar 2025": 16000, "Mar 2026": 18500 },
    Borrowings: { "Mar 2023": 410, "Mar 2024": 520, "Mar 2025": 610, "Mar 2026": 580 } },
  availability: [{ period: "Mar 2023", available_from: "2023-05-12" }, { period: "Mar 2024", available_from: "2024-05-10" },
    { period: "Mar 2025", available_from: "2025-05-14" }, { period: "Mar 2026", available_from: "2026-05-13" }] } };
const bsFetch = await fetchTapetideAnnualBalanceSheet({ symbol: "EICHERMOT", client: new TapetideMcpClient({ fetchImpl: mcpFetch(() => bsPayload) }) });
assert.deepEqual(bsFetch.observations.map((o) => `${o.label}:${o.periodEnd}:${o.value}:${o.availableAt}`),
  ["Borrowings:2023-03-31:410:2023-05-12", "Borrowings:2024-03-31:520:2024-05-10", "Borrowings:2025-03-31:610:2025-05-14", "Borrowings:2026-03-31:580:2026-05-13"]);
assert.equal(isBorrowingsRow("Other Borrowings"), false);
assert.equal(latestMarchOnOrBefore("2026-06-30"), "2026-03-31");
assert.equal(latestMarchOnOrBefore("2025-12-31"), "2025-03-31");
assert.equal(latestMarchOnOrBefore("2026-03-31"), "2026-03-31");
const bsArchive = "gs://test/bs.json";
const bsFor = (target: string, cutoff = CUTOFF) => tapetideBalanceSheetEvidence({ symbol: "EICHERMOT", companyName: "Eicher Motors", cutoff,
  targetPeriodEnd: target, observations: bsFetch.observations, payloadBytes: bsFetch.payloadBytes!, archiveUri: bsArchive });
const juneBs = bsFor("2026-06-30");
assert.deepEqual([juneBs.candidates[0].previous_period.end_date, juneBs.candidates[0].current_period.end_date], ["2025-03-31", "2026-03-31"]);
assert.match(juneBs.candidates[0].current_source_locator.quoted_label, /as at 31 Mar 2026 \(provider data, not cross-verified/);
assert.deepEqual([bsFor("2025-12-31").candidates[0].current_period.end_date], ["2025-03-31"]);
assert.equal(bsFor("2026-03-31", "2026-04-30").candidates.length, 0, "March 2026 balance sheet not yet available at that cutoff");

// 3. Documents: real listing shapes from 21 Oct (HAL has no Q1 FY27 call; Eicher does).
const halListing = { data: { symbol: "HAL", documents: [{ doc_id: 17077514, doc_type: "concall", period: "May 2026", num_pages: 19 },
  { doc_id: null, doc_type: "annual_report", period: "" }, { doc_id: 26323509, doc_type: "annual_report", period: "FY2026", num_pages: 414 }] } };
const eicherListing = { data: { symbol: "EICHERMOT", documents: [{ doc_id: 26313284, doc_type: "concall", period: "Aug 2026", num_pages: 22 },
  { doc_id: null, doc_type: "presentation", period: "" }, { doc_id: 25315901, doc_type: "concall", period: "Jul 2026", num_pages: 76 },
  { doc_id: 17067362, doc_type: "concall", period: "May 2026", num_pages: 20 }] } };
assert.equal(documentsFromListing(halListing).length, 2, "unparsed entries without doc_id are skipped");
assert.deepEqual(resultsWindowDocuments(documentsFromListing(halListing), "2026-06-30", CUTOFF), []);
assert.deepEqual(resultsWindowDocuments(documentsFromListing(eicherListing), "2026-06-30", CUTOFF).map((d) => d.doc_id), [26313284, 25315901]);
assert.deepEqual(resultsWindowDocuments(documentsFromListing(eicherListing), "2026-03-31", CUTOFF).map((d) => d.doc_id), [17067362, 25315901],
  "the May results call outranks the July transcript for the March quarter");

// 4. Page-checked values in parsed text.
const transcript = (q: string, prior: string, end: string, current: number, previous: number) =>
  `<!-- page 1 -->\nEicher Motors ${q} earnings call.\n<!-- page 4 -->\nRoyal Enfield sales volume for ${q} was ${current.toLocaleString("en-IN")} units against `
  + `${previous.toLocaleString("en-IN")} units in ${prior}, for the quarter ended ${end}.\n<!-- page 5 -->\nMargins were stable.`;
const q1Text = transcript("Q1 FY27", "Q1 FY26", "30.06.2026", 265000, 228000);
assert.deepEqual(textSupportsComparison(q1Text, { labels: ["sales volume"], previousValue: 228000, currentValue: 265000,
  previousPeriod: "Q1 FY26", previousEnd: "2025-06-30", currentPeriod: "Q1 FY27", currentEnd: "2026-06-30" }), { ok: true, page: 4 });
assert.equal(textSupportsComparison(q1Text, { labels: ["sales volume"], previousValue: 228000, currentValue: 265001,
  previousPeriod: "Q1 FY26", previousEnd: "2025-06-30", currentPeriod: "Q1 FY27", currentEnd: "2026-06-30" }).ok, false);

// 5. End to end with fake Tapetide + fake model, then real scorer + history gate across three quarters.
const quarters = [
  { end: "2025-12-31", q: "Q3 FY26", prior: "Q3 FY25", priorEnd: "2024-12-31", doc: 15000001, period: "Feb 2026", cur: 248000, prev: 221000, dateText: "31.12.2025" },
  { end: "2026-03-31", q: "Q4 FY26", prior: "Q4 FY25", priorEnd: "2025-03-31", doc: 17067362, period: "May 2026", cur: 251000, prev: 230000, dateText: "31.03.2026" },
  { end: "2026-06-30", q: "Q1 FY27", prior: "Q1 FY26", priorEnd: "2025-06-30", doc: 26313284, period: "Aug 2026", cur: 265000, prev: 228000, dateText: "30.06.2026" },
];
const listing = { data: { documents: quarters.map((q) => ({ doc_id: q.doc, doc_type: "concall", period: q.period, num_pages: 20 })) } };
const texts = new Map(quarters.map((q) => [q.doc, transcript(q.q, q.prior, q.dateText, q.cur, q.prev)]));
const quarterly = ["2024-12-31", "2025-03-31", "2025-06-30", "2025-12-31", "2026-03-31", "2026-06-30"].flatMap((end, i) => {
  const sales = [4100, 4300, 4400, 4900, 5100, 5300][i], op = [1050, 1100, 1130, 1290, 1340, 1420][i], np = [960, 1000, 1040, 1150, 1190, 1260][i];
  const period = end.replace(/^(\d{4})-(\d{2})-\d{2}$/, (_m, y, m) => `${["", "", "", "Mar", "", "", "Jun", "", "", "Sep", "", "", "Dec"][Number(m)]} ${y}`);
  const availableAt = new Date(Date.parse(`${end}T00:00:00Z`) + 45 * 86_400_000).toISOString().slice(0, 10);
  return [{ label: "Sales", period, periodEnd: end, value: sales, availableAt }, { label: "Operating Profit", period, periodEnd: end, value: op, availableAt },
    { label: "Net Profit", period, periodEnd: end, value: np, availableAt }];
});
const quarterlyBytes = Buffer.from(JSON.stringify(quarterly));
const metrics = [{ metric: "sales_volume", units: ["units", "vehicles", "thousand units"] }, { metric: "order_book", units: ["INR crore"] }];
let history: FcsCheckpoint[] = [];
for (const q of quarters) {
  const reads: number[] = [];
  const documents = await tapetideExecutionEvidence({ symbol: "EICHERMOT", companyName: "Eicher Motors", cutoff: CUTOFF, targetPeriodEnd: q.end, metrics,
    callTool: async (name, args: any) => { if (name === "list_company_documents") return listing; reads.push(args.doc_id); return { data: { markdown: texts.get(args.doc_id) } }; },
    extract: async ({ targetPeriodEnd }) => targetPeriodEnd === q.end ? [
      { metricName: "sales_volume", previousPeriod: q.prior, currentPeriod: q.q, previousPeriodEndDate: q.priorEnd, currentPeriodEndDate: q.end,
        previousValue: q.prev, currentValue: q.cur, unit: "units", quotedLabel: "Royal Enfield sales volume", comparisonBasis: "same_quarter_prior_year" },
      { metricName: "order_book", previousPeriod: q.prior, currentPeriod: q.q, previousPeriodEndDate: q.priorEnd, currentPeriodEndDate: q.end,
        previousValue: 1, currentValue: 2, unit: "INR crore", quotedLabel: "Order book", comparisonBasis: "point_in_time_prior_period" }] : [],
    archive: async (_bytes, sha) => `gs://test/${sha}.md`, capturedAt: "2026-10-21T00:00:00Z" });
  assert.equal(documents.candidates.length, 1, `${q.q}: the invented order book is not in the text and is dropped`);
  assert.ok(documents.diagnostics.some((d) => d.outcome === "document_values_not_verified" && d.metric === "order_book"));
  assert.equal(documents.candidates[0].current_source_locator.page, 4);
  assert.equal(documents.documents[0].cross_verification, "not_cross_verified_with_exchange_filing");
  assert.equal(reads.length, 1, "one read per quarter when the first document qualifies");
  const provider = tapetideCanonicalEvidence({ symbol: "EICHERMOT", companyName: "Eicher Motors", cutoff: CUTOFF, targetPeriodEnd: q.end,
    observations: quarterly, payloadBytes: quarterlyBytes, archiveUri: "gs://test/q.json" });
  const bs = bsFor(q.end);
  const bundle = { ...provider, candidates: [...provider.candidates, ...bs.candidates, ...documents.candidates],
    documents: [...provider.documents, ...bs.documents, ...documents.documents], validations: [...provider.validations, ...bs.validations, ...documents.validations] };
  const merged = mergeProviderEvidence({ candidates: [], documents: [], validations: [], diagnostics: [] }, bundle);
  const result = score({ symbol: "EICHERMOT", ...merged });
  assert.equal(result.score_publishable, true, `${q.q}: ${JSON.stringify(result.rejected_candidates ?? result.reasons)}`);
  assert.equal(result.publication_lane, "provisional");
  const checkpoint = checkpointFromScore({ symbol: "EICHERMOT", score: result, informationCutoff: CUTOFF, calculatedAt: "t", sourceJobId: "t", documents: merged.documents });
  assert.ok(checkpoint, `${q.q}: quarterly checkpoint`);
  history = mergeCheckpoint(history, checkpoint!);
  console.log(`${q.q}: FCS ${result.fcs_score}  (Balance Sheet as at ${bs.candidates[0].current_period.end_date}; Execution page ${documents.candidates[0].current_source_locator.page})`);
}
assert.equal(new Set(history.map((c) => c.comparabilityKey)).size, 1, "three quarters share one comparability key");
const lifecycle = assessLifecycle(history, CUTOFF, "2026-10-21T00:00:00Z");
assert.ok(lifecycle, "lifecycle forms from Tapetide quarterly + annual balance sheet + document Execution");
console.log(`Lifecycle: ${lifecycle!.classification} (${lifecycle!.reason})`);

// 6. Call savings: shared cache across the quarters of one review; limit errors never cached.
TapetideMcpClient.clearCache();
let toolCalls = 0, quota = true;
const counting = mcpFetch((name) => { toolCalls += 1; return quota ? quotaText : { data: { periods: ["Jun 2026"], data: { Sales: { "Jun 2026": 1 } } } }; });
assert.equal((await fetchTapetideQuarterlyFinancials({ symbol: "MARICO", client: new TapetideMcpClient({ fetchImpl: counting }) })).diagnostics[0].outcome, "tapetide_quota_exhausted");
quota = false;
// Free plan: after the limit reply, nothing is sent until the 00:00 IST reset.
assert.equal((await fetchTapetideQuarterlyFinancials({ symbol: "MARICO", client: new TapetideMcpClient({ fetchImpl: counting }) })).diagnostics[0].outcome, "tapetide_quota_exhausted");
assert.equal(toolCalls, 1, "no request sent while the daily limit is latched");
assert.equal(new Date(TapetideMcpClient.nextIstMidnight(Date.parse("2026-10-23T06:15:00Z"))).toISOString(), "2026-10-23T18:30:00.000Z", "next reset is 00:00 IST");
assert.equal(new Date(TapetideMcpClient.nextIstMidnight(Date.parse("2026-10-23T19:00:00Z"))).toISOString(), "2026-10-24T18:30:00.000Z");
TapetideMcpClient.resetQuotaLatch();   // simulate the midnight reset
await fetchTapetideQuarterlyFinancials({ symbol: "MARICO", client: new TapetideMcpClient({ fetchImpl: counting }) });
await fetchTapetideQuarterlyFinancials({ symbol: "MARICO", client: new TapetideMcpClient({ fetchImpl: counting }) });
assert.equal(toolCalls, 2, "the quota reply was not cached; the second identical request was served from cache");
assert.ok(TapetideMcpClient.usage.cacheHits >= 1);

// 7. Full Markdown via the listing link: no read_document calls; falls back when the link fails.
const linkListing = { data: { documents: [{ doc_id: 26313284, doc_type: "concall", period: "Aug 2026", num_pages: 22, has_markdown: true,
  links: { markdown_url: "https://tapetide.com/docs/26313284.md", pdf_url: "https://www.bseindia.com/xml-data/corpfiling/AttachHis/x.pdf" } },
  { doc_id: 999, doc_type: "concall", period: "Aug 2026", has_markdown: false }] } };
assert.deepEqual(documentsFromListing(linkListing).map((d) => [d.doc_id, d.markdown_url, d.pdf_url]),
  [[26313284, "https://tapetide.com/docs/26313284.md", "https://www.bseindia.com/xml-data/corpfiling/AttachHis/x.pdf"]], "unparsed (has_markdown=false) skipped");
const q1 = quarters[2];
const execRow = [{ metricName: "sales_volume", previousPeriod: q1.prior, currentPeriod: q1.q, previousPeriodEndDate: q1.priorEnd, currentPeriodEndDate: q1.end,
  previousValue: q1.prev, currentValue: q1.cur, unit: "units", quotedLabel: "Royal Enfield sales volume", comparisonBasis: "same_quarter_prior_year" }];
for (const linkWorks of [true, false]) {
  const used: string[] = [];
  const evidence = await tapetideExecutionEvidence({ symbol: "EICHERMOT", companyName: "Eicher Motors", cutoff: CUTOFF, targetPeriodEnd: q1.end, metrics,
    callTool: async (name, args: any) => { used.push(name); return name === "list_company_documents" ? linkListing : { data: { markdown: texts.get(args.doc_id) } }; },
    fetchText: async () => (linkWorks ? texts.get(26313284)! : null), extract: async () => execRow,
    archive: async (_b, sha) => `gs://test/${sha}.md` });
  assert.equal(evidence.candidates.length, 1);
  assert.equal(evidence.documents[0].source_url, "https://www.bseindia.com/xml-data/corpfiling/AttachHis/x.pdf", "links to the original PDF");
  assert.deepEqual(used, linkWorks ? ["list_company_documents"] : ["list_company_documents", "read_document"]);
  const usage = evidence.diagnostics.at(-1)!;
  assert.equal(usage.markdown_link_downloads, linkWorks ? 1 : 0);
}
console.log("Call savings: cache reuse, uncached limit errors, Markdown link with read_document fallback.");

// 8. Regressions from the 22 Oct live run: real Tapetide shapes.
const realStart = "<!-- page 1 -->\n# www.eichermotors.com\n\nAugust 04, 2026\n\n## Online intimation/submission\n" + "| x |\n".repeat(60);
assert.equal(isUsableMarkdown(realStart), true, "Tapetide Markdown begins with a page marker, not HTML");
assert.equal(isUsableMarkdown("<!DOCTYPE html><html><body>Sign in</body></html>" + " ".repeat(300)), false);
assert.equal(isUsableMarkdown("<html><head></head>" + "x".repeat(300)), false);
assert.equal(isUsableMarkdown("short"), false);
const realListingEntry = { data: { documents: [{ doc_id: 26313284, doc_type: "concall", period: "Aug 2026", doc_date: "2026-08-01", num_pages: 22,
  has_markdown: true, source_url: "https://www.bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname=8c3a03ae.pdf",
  links: { pdf_url: "https://filings.tapetide.com/raw/concall/4628/26313284.pdf", markdown_url: "https://filings.tapetide.com/documents/concall/4628/26313284.md" } },
  { doc_id: null, doc_type: "presentation", period: null, doc_date: "2026-08-01", has_markdown: false, links: { markdown_url: null } }] } };
const parsedReal = documentsFromListing(realListingEntry);
assert.deepEqual(parsedReal.map((d) => [d.doc_id, d.date, d.markdown_url]), [[26313284, "2026-08-01", "https://filings.tapetide.com/documents/concall/4628/26313284.md"]]);
assert.deepEqual(textFromReadDocument({ data: { doc_id: 1, markdown: "<!-- page 1 -->\nhello", next_pages: "3-14" } }), { text: "<!-- page 1 -->\nhello", nextPages: "3-14" });
assert.equal(textFromReadDocument({ data: { pages: [{ page: 1, markdown: "a" }, { page: 2, markdown: "b" }] } }).text, "a\nb");
console.log("Real Tapetide shapes: page-marker Markdown accepted, doc_date used, read_document text parsed.");
assert.equal(createHash("sha256").update("x").digest("hex").length, 64);
console.log("Tapetide beta sources (quota error, annual Balance Sheet, document Execution) verified offline end to end.");
