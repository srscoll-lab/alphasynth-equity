import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createFcsScannedDocumentOcr, documentAiPageText, looksScanned, type CachedOcr } from "../src/fcs-scanned-document-ocr.ts";
import { retrieveGroundedFcsDocuments } from "../src/fcs-grounded-document-retrieval.ts";
import { canonicalizeDynamicEvidence } from "../src/fundamental-review-dynamic-evidence.ts";

const PROCESSOR = "projects/my-nse-research-app/locations/us/processors/abc123";
// Text layer of Solar's 15 May 2026 audited results: a cover letter, then image-only pages.
const coverLetter = "May 15, 2026 To, National Stock Exchange of India Limited BSE Limited Sub: Audited Financial Results "
  + "(Standalone and Consolidated) of the Company for the quarter and year ended on March 31, 2026. ".repeat(6);

// 1. Scan detection.
assert.equal(looksScanned(coverLetter, 44), true, "Solar March results: ~1.2k chars over 44 pages");
assert.equal(looksScanned("x".repeat(3000 * 10), 10), false, "a normal text PDF");
assert.equal(looksScanned(coverLetter, 1), false, "a one-page letter is not a scan");
assert.equal(looksScanned("", 0), false, "unknown page count never triggers OCR");

// 2. Document AI page text and the confidence gate.
const fullText = "Statement of Assets and Liabilities as at 31.03.2026 31.03.2025\nTotal Equity 9,259.10 7,212.40\n"
  + "Smudged page ?? 12 3?\n" + "Borrowings 1,980.55 1,640.21\n";
const page = (n: number, start: number, end: number, confidence: number) =>
  ({ pageNumber: n, layout: { confidence, textAnchor: { textSegments: [{ startIndex: String(start), endIndex: String(end) }] } } });
const i1 = fullText.indexOf("Smudged"), i2 = fullText.indexOf("Borrowings");
const documentAi = { text: fullText, pages: [page(3, 0, i1, 0.97), page(4, i1, i2, 0.42), page(5, i2, fullText.length, 0.93)] };
const pageText = documentAiPageText(documentAi, 0.85);
assert.equal(pageText.pagesUsed, 2);
assert.equal(pageText.pagesDropped, 1);
assert.equal(pageText.meanConfidence, 0.95);
assert.ok(pageText.text.includes("[PAGE 3]") && pageText.text.includes("Total Equity 9,259.10 7,212.40"));
assert.ok(!pageText.text.includes("Smudged"), "low-confidence page is dropped, not repaired");

// 3. Request shape, caching, budget and failures, with no network.
const store = new Map<string, CachedOcr>();
const cache = { get: async (sha: string) => store.get(sha) ?? null, put: async (sha: string, value: CachedOcr) => { store.set(sha, value); } };
const calls: Array<{ url: string; body: any; auth: string }> = [];
let respondWith = 200;
const fakeDocumentAi = (async (url: string, init: any) => {
  calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
  return respondWith === 200 ? new Response(JSON.stringify({ document: documentAi }), { status: 200 }) : new Response("{}", { status: respondWith });
}) as unknown as typeof fetch;
const pdf = (label: string) => new Uint8Array(Buffer.from(`%PDF-1.7 ${label}`));
const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const ocr = createFcsScannedDocumentOcr({ processor: PROCESSOR, accessToken: async () => "test-token", fetchImpl: fakeDocumentAi, cache });

const first = pdf("march-results");
const result = await ocr.ocr({ data: first, sha256: sha(first), text: coverLetter, pageCount: 44 });
assert.equal(result?.textSource, "document_ai_ocr");
assert.equal(result?.fromCache, false);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, `https://us-documentai.googleapis.com/v1/${PROCESSOR}:process`);
assert.equal(calls[0].auth, "Bearer test-token");
assert.equal(calls[0].body.imagelessMode, true);
assert.equal(calls[0].body.processOptions.fromStart, 30);
assert.equal(calls[0].body.rawDocument.mimeType, "application/pdf");
assert.equal(Buffer.from(calls[0].body.rawDocument.content, "base64").toString(), "%PDF-1.7 march-results");
assert.ok(store.has(sha(first)), "OCR text cached by SHA-256");

const again = await ocr.ocr({ data: first, sha256: sha(first), text: coverLetter, pageCount: 44 });
assert.equal(again?.fromCache, true);
assert.equal(calls.length, 1, "cache hit makes no Document AI call");

const textPdf = pdf("text-layer");
assert.equal(await ocr.ocr({ data: textPdf, sha256: sha(textPdf), text: "x".repeat(40_000), pageCount: 20 }), null);
assert.equal(calls.length, 1, "normal PDFs never reach OCR");

const second = pdf("second-scan"), third = pdf("third-scan");
assert.ok(await ocr.ocr({ data: second, sha256: sha(second), text: coverLetter, pageCount: 30 }));
assert.equal(await ocr.ocr({ data: third, sha256: sha(third), text: coverLetter, pageCount: 30 }), null);
assert.equal(calls.length, 2, "budget: at most two OCR requests per review");
assert.ok(ocr.diagnostics.some((d) => d.outcome === "ocr_budget_exhausted"));

respondWith = 500;
const failing = createFcsScannedDocumentOcr({ processor: PROCESSOR, accessToken: async () => "t", fetchImpl: fakeDocumentAi });
const failed = pdf("server-error");
assert.equal(await failing.ocr({ data: failed, sha256: sha(failed), text: coverLetter, pageCount: 30 }), null);
assert.ok(failing.diagnostics.some((d) => d.outcome === "ocr_request_failed" && d.detail === "HTTP 500"));
respondWith = 200;
assert.throws(() => createFcsScannedDocumentOcr({ processor: "https://evil.example/x", accessToken: async () => "t" }));

// 4. Retrieval hook: OCR replaces only a sparse text layer and marks the document.
const scannedBytes = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(4096, 32)]);
const fakePdfFetch = (async () => new Response(scannedBytes, { status: 200, headers: { "content-type": "application/pdf" } })) as unknown as typeof fetch;
const candidate = [{ uri: "https://www.bseindia.com/xml-data/corpfiling/AttachHis/a8bee741-7c8e-47fb-9526-620a15aea728.pdf", title: "Q4 FY26 results" }];
const withOcr = await retrieveGroundedFcsDocuments(candidate, { trustedIssuerDomains: [], fetchImpl: fakePdfFetch,
  extractText: async () => coverLetter, countPages: async () => 44, maximumPages: 40,
  ocr: async ({ pageCount }) => (pageCount === 44 ? { text: pageText.text, textSource: "document_ai_ocr" } : null) });
assert.equal(withOcr.documents[0].textSource, "document_ai_ocr");
assert.ok(withOcr.documents[0].text.includes("Total Equity 9,259.10"));
assert.ok(withOcr.diagnostics.some((d) => d.code === "ocr_text_chars"));
const withoutOcr = await retrieveGroundedFcsDocuments(candidate, { trustedIssuerDomains: [], fetchImpl: fakePdfFetch,
  extractText: async () => coverLetter, countPages: async () => 44 });
assert.equal(withoutOcr.documents[0].textSource, undefined, "OCR is off unless a hook is configured");
assert.equal(withoutOcr.documents[0].text, coverLetter);

// 5. The OCR label survives into canonical evidence documents.
const canonical = canonicalizeDynamicEvidence({ ticker: "SOLARINDS", information_cutoff: "2026-10-19", rows: [{
  factor: "balance_sheet", metric_name: "total_equity", comparison_basis: "point_in_time_prior_period", consolidation_basis: "consolidated",
  previous_period_end_date: "2025-03-31", current_period_end_date: "2026-03-31", previous_period: "As on 31.03.2025", current_period: "As on 31.03.2026",
  source_date: "2026-05-15", source_ref: candidate[0].uri, document_sha256: sha(new Uint8Array(scannedBytes)),
  archived_document_uri: "gs://test/a.pdf", unit: "INR crore", previous_value: 7212.4, current_value: 9259.1,
  quoted_label: "Total Equity", text_source: "document_ai_ocr" }] });
assert.equal(canonical.documents[0].text_source, "document_ai_ocr");

console.log("FCS scanned-document OCR: detection, confidence gate, request, cache, budget, failure and labelling verified offline.");
