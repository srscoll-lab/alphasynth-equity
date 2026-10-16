import assert from "node:assert/strict";
import { discoverTapetideFcsSources, fetchTapetideFinancialCandidates, financialObservationsFromPayload } from "../src/tapetide-fcs-provider.ts";
import { providerAssistedFcsPreflight, type FcsEvidencePreflightRecord } from "../src/fcs-evidence-preflight.ts";

process.env.TAPETIDE_TOKEN = "test-token";
process.env.TAPETIDE_MCP_URL = "https://mcp.tapetide.test/mcp";

const calls: any[] = [];
const fetchImpl: typeof fetch = async (_input, init) => {
  const body = JSON.parse(String(init?.body || "{}"));
  calls.push(body);
  if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18", capabilities: {} } }), { headers: { "mcp-session-id": "session-1", "content-type": "application/json" } });
  if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
  const payload = body.params.name === "get_stock_events"
    ? { filings: [
      { title: "Trading Window", source_url: "https://nsearchives.nseindia.com/corporate/TEST_window.pdf", published_at: "2026-08-01" },
      { title: "Quarterly results", source_url: "https://nsearchives.nseindia.com/corporate/TEST_results.pdf", published_at: "2026-07-20" },
      { title: "News copy", url: "https://example-news.test/story", date: "2026-07-20" },
    ] }
    : { documents: [
      { name: "Investor release", pdf_url: "https://investor.example.com/q1.pdf", filing_date: "2026-07-21" },
      { name: "Post-cutoff release", pdf_url: "https://investor.example.com/q2.pdf", filing_date: "2027-01-01" },
    ] };
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { structuredContent: payload } }), { headers: { "content-type": "application/json" } });
};

const discovery = await discoverTapetideFcsSources({
  symbol: "TEST",
  issuerDomains: ["investor.example.com"],
  cutoff: "2026-10-13",
  fetchImpl,
});
assert.equal(discovery.configured, true);
assert.deepEqual(discovery.sources.map((source) => source.uri), [
  "https://nsearchives.nseindia.com/corporate/TEST_results.pdf",
  "https://investor.example.com/q1.pdf",
  "https://nsearchives.nseindia.com/corporate/TEST_window.pdf",
]);
assert.equal(calls.filter((call) => call.method === "tools/call").length, 2);

const unavailable: FcsEvidencePreflightRecord = {
  symbol: "TEST", companyName: "Test Limited", capSegment: "Mid cap", status: "unavailable", requestEnabled: false,
  action: "deep_dive_only", reasonCodes: ["outside_verified_preflight_batch"], reason: "Not checked", evidenceCheckedAt: "2026-10-13",
  evidenceCutoff: "2026-10-13", evidence: { publishedFourFactorReport: false, approvedFourFactorEvidence: false, currentComparableDocumentsVerified: false },
};
const assisted = providerAssistedFcsPreflight(unavailable, true);
assert.equal(assisted.status, "provider_assisted");
assert.equal(assisted.requestEnabled, true);
assert.equal(assisted.action, "request_fcs");
assert(assisted.reasonCodes.includes("controlled_large_mid_cap_beta"));
assert.equal(assisted.evidence.approvedFourFactorEvidence, false);

const smallCapAssisted = providerAssistedFcsPreflight({ ...unavailable, capSegment: "Small cap" }, true);
assert.equal(smallCapAssisted.status, "provider_assisted");
assert.equal(smallCapAssisted.requestEnabled, false);
assert.equal(smallCapAssisted.action, "deep_dive_only");
assert(smallCapAssisted.reasonCodes.includes("outside_controlled_large_mid_cap_beta"));

console.log("Tapetide discovery contract verified with controlled large/mid-cap request activation and unchanged publication gates.");

const observations = financialObservationsFromPayload({
  quarterly: {
    periods: ["Jun 2025", "Jun 2026"],
    availability_dates: ["2025-07-20", "2026-07-21"],
    rows: [
      { label: "Sales", values: [167, 259] },
      { label: "Operating Profit", values: [17, 28] },
      { label: "OPM %", values: [10, 11] },
      { label: "Net Profit", values: [12, 18] },
      { label: "EPS", values: [1, 2] },
    ],
  },
});
assert.equal(observations.length, 8);
assert.equal(observations.filter((item) => item.periodEnd === "2026-06-30").length, 4);
const keyedObservations = financialObservationsFromPayload({ data: [{
  period_type: "quarterly", periods: ["Jun 2025", "Jun 2026"],
  availability: [{ period: "Jun 2025", available_from: "2025-07-20" }, { period: "Jun 2026", available_from: "2026-07-21" }],
  data: { Sales: { "Jun 2025": 167, "Jun 2026": 259 }, "Operating Profit": { "Jun 2025": 17, "Jun 2026": 28 },
    "OPM %": { "Jun 2025": 10, "Jun 2026": 11 }, "Net Profit": { "Jun 2025": 12, "Jun 2026": 18 } },
}] });
assert.equal(keyedObservations.length, 8);
assert.equal(keyedObservations.find((item) => item.label === "Sales" && item.periodEnd === "2026-06-30")?.availableAt, "2026-07-21");

const financialFetch: typeof fetch = async (_input, init) => {
  const body = JSON.parse(String(init?.body || "{}"));
  if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18", capabilities: {} } }), { headers: { "mcp-session-id": "session-2", "content-type": "application/json" } });
  if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
  assert.equal(body.params.name, "get_financials");
  assert.equal(body.params.arguments.section, "quarterly");
  assert.equal(body.params.arguments.periods, 8);
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { structuredContent: { quarterly: {
    periods: ["Jun 2025", "Jun 2026"], availability_dates: ["2025-07-20", "2026-07-21"],
    rows: [{ label: "Sales", values: [167, 259] }, { label: "OPM %", values: [10, 11] }],
  } } } }), { headers: { "content-type": "application/json" } });
};
const snapshot = await fetchTapetideFinancialCandidates({ symbol: "MARINE", cutoff: "2026-10-14", fetchImpl: financialFetch });
assert.equal(snapshot.candidates.length, 2);
assert.equal(snapshot.candidates[0].verificationStatus, "candidate_only");
assert.equal(snapshot.candidates[0].currentPeriodEnd, "2026-06-30");
assert.equal((snapshot as any).publicationEligible, undefined);
console.log("Tapetide structured-financial candidate adapter verified without creating publishable evidence.");
