import assert from "node:assert/strict";
import { retrieveGroundedFcsDocuments } from "../src/fcs-grounded-document-retrieval.ts";
import { detectedFactorFamilies, qualifyPreflightDocuments, reportedQuarterEnds } from "../src/fcs-preflight-collector.ts";

const padding = " Consolidated financial results. ".repeat(30);
const currentText = `October 20, 2026\nQuarter ended September 30, 2026\nRevenue INR 4,200 crore; PAT INR 510 crore. EBITDA margin 18.4%. Order book INR 8,000 crore and production volume 1.2 million. Net debt INR 900 crore and free cash flow INR 300 crore.${padding}`;
const comparableText = `October 20, 2025\nQuarter ended September 30, 2025\nRevenue INR 3,700 crore; PAT INR 420 crore. EBITDA margin 16.1%. Order book INR 6,500 crore and production volume 1.0 million. Net debt INR 1,100 crore and free cash flow INR 210 crore.${padding}`;

assert.deepEqual(reportedQuarterEnds(currentText), ["2026-09-30"]);
assert.deepEqual(detectedFactorFamilies(currentText), ["earnings", "economics", "execution", "balance_sheet"]);

let fetchCalls = 0;
const mockedFetch: typeof fetch = async (input) => {
  fetchCalls += 1;
  const url = String(input);
  const marker = url.includes("current") ? "%PDF-current" : "%PDF-comparable";
  const response = new Response(new TextEncoder().encode(marker), { status: 200, headers: { "content-type": "application/pdf" } });
  Object.defineProperty(response, "url", { value: url });
  return response;
};
const retrieved = await retrieveGroundedFcsDocuments([
  { uri: "https://investor.issuer.example/current.pdf" },
  { uri: "https://investor.issuer.example/comparable.pdf" },
  { uri: "https://untrusted.example/bad.pdf" },
], {
  trustedIssuerDomains: ["issuer.example"],
  fetchImpl: mockedFetch,
  extractText: async (bytes) => new TextDecoder().decode(bytes).includes("current") ? currentText : comparableText,
  maxDocuments: 4,
  maxRequests: 4,
});
assert.equal(fetchCalls, 2, "The untrusted candidate must be rejected before fetch.");
assert.equal(retrieved.documents.length, 2);

const qualified = qualifyPreflightDocuments({
  symbol: "TEST",
  checkedAt: "2026-10-21T00:00:00Z",
  cutoff: "2026-10-21",
  trustedIssuerDomains: ["issuer.example"],
  documents: retrieved.documents,
});
assert.ok(qualified.approval);
assert.equal(qualified.approval?.currentDocument.publishedAt, "2026-10-20");
assert.equal(qualified.approval?.comparableDocument.publishedAt, "2025-10-20");
assert.deepEqual(qualified.approval?.factorFamilies, ["earnings", "economics", "execution", "balance_sheet"]);

const incomplete = qualifyPreflightDocuments({
  symbol: "TEST",
  checkedAt: "2026-10-21T00:00:00Z",
  cutoff: "2026-10-21",
  trustedIssuerDomains: ["issuer.example"],
  documents: retrieved.documents.map((document) => ({ ...document, text: document.text.replace(/Net debt[^.]+\.|free cash flow[^.]+\./gi, "") })),
});
assert.equal(incomplete.approval, null);
assert.ok(incomplete.reasons.includes("missing_balance_sheet"));

const futureDated = qualifyPreflightDocuments({
  symbol: "TEST",
  checkedAt: "2026-10-19T00:00:00Z",
  cutoff: "2026-10-19",
  trustedIssuerDomains: ["issuer.example"],
  documents: retrieved.documents,
});
assert.equal(futureDated.approval, null, "A document published after the cutoff must not qualify.");

console.log(JSON.stringify({ status: "passed", mockedFetchCalls: fetchCalls, modelCalls: 0, promotedFixture: qualified.approval?.symbol }));
