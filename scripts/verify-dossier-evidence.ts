import assert from "node:assert/strict";
import { collectOfficialEvidence, discoverOfficialDocuments, documentPublicationDate, exactEvidenceDate, unwrapOfficialPdfViewerUrl } from "../src/dossier-evidence";

const base = "https://radicokhaitan.com/investor-relations/";
const domains = ["radicokhaitan.com"];
const pdf = "https://radicokhaitan.com/wp-content/uploads/2026/07/earnigspresentation.pdf";
const html = `<p class="RadicoPDF">Q1 FY2027 Earnings Presentation <a href="${pdf}"><span><i class="pdf"></i></span></a></p>
<p>Financial Results <a href="https://evil.example/a.pdf">PDF</a></p>
<p>Policy <a href="/policy.pdf">PDF</a></p>
<p>Q1 Financial Results <a href="/results.pdf"><i></i></a></p>`;
const cover = "RKL/SX/2026-27/43 July 28, 2026\n\n**BSE Limited**\nNational Stock Exchange of India Limited\nSymbol: RADICO\nSubject: Earnings Presentation\n" + "Revenue increased according to the unaudited financial results. ".repeat(20);
const links = discoverOfficialDocuments(html, base, domains);
assert.equal(links.length, 2);
assert.equal(links[0].url, pdf);
assert.match(links[0].title!, /Earnings Presentation/);
const archive = discoverOfficialDocuments(html + '<p>Press release May 02, 2025 <a href="/2025/pressrelease020525.pdf">PDF</a></p><p>Q3 FY2019 Earnings Call <a href="/2019/CLT_20190122045559.pdf">PDF</a></p>', base, domains);
assert.equal(archive[0].url, pdf);
assert.equal(exactEvidenceDate("July 28, 2026"), "2026-07-28");
assert.equal(exactEvidenceDate("28 July 2026"), "2026-07-28");
assert.equal(exactEvidenceDate("2026-02-30"), null);
assert.equal(exactEvidenceDate("August 2026"), null);
assert.equal(exactEvidenceDate("/uploads/2026/07/report.pdf"), null);
assert.equal(documentPublicationDate({ markdown: cover }, { url: pdf }).date, "2026-07-28");
assert.equal(documentPublicationDate({ markdown: "Quarter ended June 30, 2026\nFinancial results" }, { url: pdf }).date, null);
assert.deepEqual(
  documentPublicationDate(
    { markdown: "Infosys quarterly press release. ".repeat(20) },
    { url: "https://www.infosys.com/newsroom/press-releases/documents/2026/q4-apr23-2026.pdf" },
  ),
  { date: "2026-04-23", basis: "document_filename" },
);
assert.equal(
  documentPublicationDate(
    { markdown: "Infosys earnings call transcript. ".repeat(20) },
    { url: "https://www.infosys.com/investors/reports-filings/quarterly-results/2025-2026/q4/documents/transcripts/earningscall.pdf" },
  ).date,
  null,
);
const marutiViewer = "https://www.marutisuzuki.com/pdf-viewer?pdf=%2Fcontent%2Fdam%2Fmsil%2Fcorporate%2Fevents%2Fpdf%2FCopy-of-Financial-Results.pdf";
assert.equal(
  unwrapOfficialPdfViewerUrl(marutiViewer),
  "https://www.marutisuzuki.com/content/dam/msil/corporate/events/pdf/Copy-of-Financial-Results.pdf",
);
assert.equal(
  unwrapOfficialPdfViewerUrl("https://www.marutisuzuki.com/pdf-viewer?pdf=https%3A%2F%2Fevil.example%2Freport.pdf"),
  "https://www.marutisuzuki.com/pdf-viewer?pdf=https%3A%2F%2Fevil.example%2Freport.pdf",
);

const calls: string[] = [];
const result = await collectOfficialEvidence([{ url: base }, { url: "https://evil.example/report.pdf" }], domains, "2026-09-05", async url => {
  calls.push(url);
  if (url === base) return { rawHtml: html, markdown: "Investor Relations July 28, 2026" };
  if (url === pdf) return { markdown: cover, metadata: { url } };
  return { markdown: cover.replace("July 28, 2026", "October 28, 2026") };
});
assert.equal(result.sources.length, 1);
assert.equal(result.sources[0].url, pdf);
assert.equal(result.sources[0].publishedAt, "2026-07-28");
assert.equal(result.rejectionReasons.post_cutoff, 1);
assert.equal(result.rejectionReasons.unverified_domain, 1);
assert.ok(!calls.some(url => url.includes("evil.example")));
assert.ok(result.diagnostics.some(d => d.outcome === "discovery_index"));
const redirect = await collectOfficialEvidence([{ url: pdf }], domains, "2026-09-05", async () => ({ markdown: cover, metadata: { url: "https://evil.example/x.pdf" } }));
assert.equal(redirect.sources.length, 0);
assert.equal(redirect.rejectionReasons.unverified_redirect, 1);
const missing = await collectOfficialEvidence([{ url: pdf }], domains, "2026-09-05", async () => ({ markdown: "Undated official content. ".repeat(30) }));
assert.equal(missing.sources.length, 0);
assert.equal(missing.rejectionReasons.missing_publication_date, 1);
console.log("PASS: icon-only official PDF discovery, exact filing date, cutoff, undated and untrusted-source rejection.");
