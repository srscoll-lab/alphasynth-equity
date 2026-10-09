import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import { retrieveGroundedFcsDocuments, type GroundedRetrievalOptions } from "../src/fcs-grounded-document-retrieval.ts";

// All source responses are fixtures; no network, cloud, or model calls.
const chunks: Buffer[] = [];
const pdf = new PDFDocument({ autoFirstPage: true });
pdf.on("data", chunk => chunks.push(Buffer.from(chunk)));
const complete = new Promise<void>(resolve => pdf.on("end", resolve));
pdf.text("Issuer quarterly results fixture. Verified source text only.");
pdf.end();
await complete;
const fixturePdf = Buffer.concat(chunks);
const grounding = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/fixture";
const issuer = "https://issuer.example";
type Fixture = { body?: string | Buffer; status?: number; headers?: Record<string, string>; error?: string };
function mockFetch(fixtures: Record<string, Fixture>) {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    assert.equal(init?.redirect, "manual");
    const fixture = fixtures[url];
    assert.ok(fixture, `Unexpected fixture request: ${url}`);
    if (fixture.error) throw new Error(fixture.error);
    return new Response(fixture.body ?? null, { status: fixture.status ?? 200, headers: fixture.headers });
  };
  return { fetchImpl, calls };
}
const options = (fetchImpl: typeof fetch, extra: Partial<GroundedRetrievalOptions> = {}): GroundedRetrievalOptions => ({ trustedIssuerDomains: ["issuer.example"], fetchImpl, ...extra });

{
  const mock = mockFetch({
    [grounding]: { status: 302, headers: { location: `${issuer}/download?id=results` } },
    [`${issuer}/download?id=results`]: { body: fixturePdf, headers: { "content-type": "application/octet-stream" } },
  });
  const result = await retrieveGroundedFcsDocuments([{ uri: grounding, title: "Quarterly results" }], options(mock.fetchImpl));
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].sourceUrl, `${issuer}/download?id=results`);
  assert.equal(result.documents[0].discoveryUrl, grounding);
  assert.match(result.documents[0].text, /Issuer quarterly results fixture/);
  assert.equal(result.documents[0].byteLength, fixturePdf.byteLength);
  assert.match(result.documents[0].sha256, /^[a-f0-9]{64}$/);
  assert.ok(result.diagnostics.some(item => item.code === "PDF_downloaded"));
  assert.ok(result.diagnostics.some(item => item.code === "pdf_text_chars"));
}
{
  const mock = mockFetch({
    [`${issuer}/investors`]: { body: '<a href="/download?id=one&amp;format=pdf">Results (PDF)</a><a href="https://impostor.example/official.pdf">Issuer PDF</a><a href="/nested">More reports</a>', headers: { "content-type": "text/html" } },
    [`${issuer}/download?id=one&format=pdf`]: { body: fixturePdf, headers: { "content-type": "application/pdf" } },
  });
  const result = await retrieveGroundedFcsDocuments([{ uri: `${issuer}/investors` }], options(mock.fetchImpl));
  assert.equal(result.documents.length, 1);
  assert.equal(mock.calls.length, 2);
  assert.ok(result.diagnostics.some(item => item.code === "rejected_domain"));
}
{
  const mock = mockFetch({ [grounding]: { status: 302, headers: { location: "https://issuer.example.evil.example/report.pdf" } } });
  const result = await retrieveGroundedFcsDocuments([{ uri: grounding, title: "Official issuer.example results" }, { uri: "http://issuer.example/report.pdf" }, { uri: "https://issuer.example@evil.example/report.pdf" }], options(mock.fetchImpl));
  assert.equal(result.documents.length, 0);
  assert.deepEqual(mock.calls, [grounding]);
  assert.ok(result.diagnostics.some(item => item.code === "rejected_domain"));
  assert.equal(result.diagnostics.filter(item => item.code === "invalid_url").length, 2);
}
{
  const mock = mockFetch({ [grounding]: { body: fixturePdf, headers: { "content-type": "application/pdf" } } });
  const result = await retrieveGroundedFcsDocuments([{ uri: grounding }], options(mock.fetchImpl));
  assert.equal(result.documents.length, 0);
  assert.ok(result.diagnostics.some(item => item.code === "unresolved_grounding_redirect"));
}
{
  const mock = mockFetch({
    [`${issuer}/too-large`]: { body: "12345678901" },
    [`${issuer}/failed`]: { error: "fixture transport failure" },
    [`${issuer}/empty.pdf`]: { body: "%PDF-fixture", headers: { "content-type": "application/pdf" } },
  });
  const result = await retrieveGroundedFcsDocuments([{ uri: `${issuer}/too-large` }, { uri: `${issuer}/failed` }, { uri: `${issuer}/empty.pdf` }], options(mock.fetchImpl, { maxDocumentBytes: 10, extractText: async () => "" }));
  assert.equal(result.documents.length, 0);
  assert.ok(result.diagnostics.some(item => item.code === "document_bytes_exceeded"));
  assert.ok(result.diagnostics.some(item => item.code === "download_error"));
  // Empty text is separately reported for an in-budget PDF.
  const emptyMock = mockFetch({ [`${issuer}/empty.pdf`]: { body: "%PDF-", headers: { "content-type": "application/pdf" } } });
  const empty = await retrieveGroundedFcsDocuments([{ uri: `${issuer}/empty.pdf` }], options(emptyMock.fetchImpl, { extractText: async () => "" }));
  assert.ok(empty.diagnostics.some(item => item.code === "empty_pdf_text"));
}
{
  const mock = mockFetch({ [`${issuer}/first`]: { body: fixturePdf, headers: { "content-type": "application/pdf" } } });
  const result = await retrieveGroundedFcsDocuments([{ uri: `${issuer}/first` }, { uri: `${issuer}/second` }], options(mock.fetchImpl, { maxRequests: 1, extractText: async () => "fixture text" }));
  assert.equal(result.documents.length, 1);
  assert.deepEqual(mock.calls, [`${issuer}/first`]);
  assert.ok(result.diagnostics.some(item => item.code === "retrieval_limit"));
}
{
  const exchange = "https://nsearchives.nseindia.com/corporate/results";
  const mock = mockFetch({ [exchange]: { body: fixturePdf, headers: { "content-type": "application/pdf" } } });
  const result = await retrieveGroundedFcsDocuments([{ uri: exchange }], { trustedIssuerDomains: [], fetchImpl: mock.fetchImpl, extractText: async () => "exchange fixture" });
  assert.equal(result.documents[0].sourceUrl, exchange);
}
{
  const mock = mockFetch({
    [`${issuer}/landing`]: { body: '<a href="/nested.pdf">PDF</a>', headers: { "content-type": "text/html" } },
    [`${issuer}/nested.pdf`]: { body: '<a href="/third.pdf">PDF</a>', headers: { "content-type": "text/html" } },
  });
  const result = await retrieveGroundedFcsDocuments([{ uri: `${issuer}/landing` }], options(mock.fetchImpl));
  assert.equal(result.documents.length, 0);
  assert.deepEqual(mock.calls, [`${issuer}/landing`, `${issuer}/nested.pdf`]);
}
{
  const mock = mockFetch({ [`${issuer}/redirect`]: { status: 302, headers: { location: "https://evil.example/document.pdf" } } });
  const result = await retrieveGroundedFcsDocuments([{ uri: `${issuer}/redirect` }], options(mock.fetchImpl));
  assert.equal(result.documents.length, 0);
  assert.equal(mock.calls.length, 1);
  assert.ok(result.diagnostics.some(item => item.code === "rejected_domain"));
}
{
  const mock = mockFetch({ [`${issuer}/limit`]: { body: "%PDF-", headers: { "content-type": "application/pdf" } } });
  const result = await retrieveGroundedFcsDocuments([{ uri: `${issuer}/limit` }, { uri: `${issuer}/second` }], options(mock.fetchImpl, { maxDocuments: 1, extractText: async () => "fixture text" }));
  assert.equal(result.documents.length, 1);
  assert.equal(mock.calls.length, 1);
  const byteMock = mockFetch({ [`${issuer}/limit`]: { body: "%PDF-", headers: { "content-type": "application/pdf" } } });
  const byteResult = await retrieveGroundedFcsDocuments([{ uri: `${issuer}/limit` }, { uri: `${issuer}/second` }], options(byteMock.fetchImpl, { maxTotalBytes: 5, extractText: async () => "fixture text" }));
  assert.equal(byteMock.calls.length, 1);
  assert.equal(byteResult.documents.length, 1);
}
{
  const mock = mockFetch({ [`${issuer}/scan.pdf`]: { body: fixturePdf, headers: { "content-type": "application/pdf" } } });
  const result = await retrieveGroundedFcsDocuments([{ uri: `${issuer}/scan.pdf` }], options(mock.fetchImpl, { timeoutMs: 10, extractText: async () => new Promise(() => {}) }));
  assert.equal(result.documents.length, 0);
  assert.ok(result.diagnostics.some(item => item.detail === "retrieval_timeout"));
}
const releaseText = "Financial results for the quarter ended June 30, 2026. Revenue increased and profit improved. " + "The issuer discusses operating performance, capacity utilization and financial position for the reported period. ".repeat(7);
{
  const html = `<html><head><meta property="article:published_time" content="2026-08-04T09:00:00+05:30"><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-08-04","dateModified":"2099-01-01","description":"Script revenue secret 9999"}</script></head><body><nav>Nav secret 9999</nav><article>${releaseText}</article><footer>Footer secret 9999</footer><div hidden>Hidden secret 9999</div></body></html>`;
  const mock = mockFetch({ [`${issuer}/release`]: { body: html, headers: { "content-type": "text/html", "last-modified": "Mon, 01 Jan 2099 00:00:00 GMT", date: "Mon, 01 Jan 2099 00:00:00 GMT" } } });
  const result = await retrieveGroundedFcsDocuments([{ uri: `${issuer}/release` }], options(mock.fetchImpl));
  assert.equal(result.documents.length, 1);
  const doc = result.documents[0];
  assert.equal(doc.mediaType, "text/html");
  assert.match(doc.text, /article:published_time: 2026-08-04T09:00:00\+05:30/);
  assert.match(doc.text, /datePublished: 2026-08-04/);
  assert.doesNotMatch(doc.text, /dateModified|2099|secret|9999/);
  assert.equal(Buffer.from(doc.bytes).toString(), html);
  assert.equal(doc.byteLength, Buffer.byteLength(html));
}
{
  const mock = mockFetch({ [`${issuer}/release`]: { body: `<html><head><meta name="dateModified" content="2099-01-01"></head><body><article>${releaseText}</article></body></html>`, headers: { "content-type": "text/html", date: "Mon, 01 Jan 2099 00:00:00 GMT" } } });
  const result = await retrieveGroundedFcsDocuments([{ uri: `${issuer}/release` }], options(mock.fetchImpl));
  assert.equal(result.documents.length, 1);
  assert.doesNotMatch(result.documents[0].text, /datePublished|article:published_time|2099/);
}
{
  const mock = mockFetch({});
  const result = await retrieveGroundedFcsDocuments([{ uri: "https://broker.example/issuer-financial-results", title: "Official financial results" }], options(mock.fetchImpl));
  assert.equal(result.documents.length, 0);
  assert.equal(mock.calls.length, 0);
  assert.ok(result.diagnostics.some(item => item.code === "rejected_domain"));
}
{
  const generic = "Investor relations offers access to reports, shareholder services, governance policies and contact details. ".repeat(8);
  const mock = mockFetch({
    [`${issuer}/index`]: { body: `<html><nav>${releaseText}</nav><main>${generic}</main><script>${releaseText}</script><style>${releaseText}</style></html>`, headers: { "content-type": "text/html" } },
    [`${issuer}/script-only`]: { body: `<html><body><script>${releaseText}</script><main>Welcome</main></body></html>`, headers: { "content-type": "text/html" } },
  });
  const result = await retrieveGroundedFcsDocuments([{ uri: `${issuer}/index` }, { uri: `${issuer}/script-only` }], options(mock.fetchImpl));
  assert.equal(result.documents.length, 0);
  assert.equal(result.diagnostics.filter(item => item.code === "html_not_financial_release").length, 2);
}
{
  const mock = mockFetch({
    [`${issuer}/release`]: { body: `<html><article>${releaseText}<a href="/results.pdf">Download PDF</a></article></html>`, headers: { "content-type": "text/html" } },
    [`${issuer}/results.pdf`]: { body: fixturePdf, headers: { "content-type": "application/pdf" } },
  });
  const result = await retrieveGroundedFcsDocuments([{ uri: `${issuer}/release` }], options(mock.fetchImpl, { maxDocuments: 1, extractText: async () => "PDF preferred" }));
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].mediaType, "application/pdf");
}
{
  const failedDiscovery = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/slow-fixture';
  const fetchImpl = (async (input: any, init: any) => {
    if (String(input) === failedDiscovery) return await new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Discovery timed out', 'TimeoutError')), {once:true});
    });
    return new Response(fixturePdf, {headers:{'content-type':'application/pdf'}});
  }) as typeof fetch;
  const result = await retrieveGroundedFcsDocuments([{uri:failedDiscovery},{uri:`${issuer}/results.pdf`}], {trustedIssuerDomains:['issuer.example'],fetchImpl,extractText:async()=> 'Verified next candidate',timeoutMs:10_000});
  assert.equal(result.documents.length,1,'Slow discovery must not suppress a later readable official document');
  assert.ok(result.diagnostics.some(d=>d.code==='download_error'));
}
console.log("PASS: bounded trusted PDF/financial-HTML retrieval, per-request discovery timeout, publication-metadata provenance, and rejection of navigation/script/broker evidence; all fetches mocked.");
