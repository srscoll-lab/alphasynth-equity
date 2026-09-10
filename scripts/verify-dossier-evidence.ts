import assert from "node:assert/strict";
import { collectOfficialEvidence, discoverOfficialDocuments, documentPublicationDate, exactEvidenceDate, unwrapOfficialPdfViewerUrl } from "../src/dossier-evidence.ts";

const base = "https://radicokhaitan.com/investor-relations/";
const domains = ["radicokhaitan.com"];
const pdf = "https://radicokhaitan.com/wp-content/uploads/2026/07/earnigspresentation.pdf";
const html = `<p class="RadicoPDF">Q1 FY2027 Earnings Presentation <a href="${pdf}"><span><i class="pdf"></i></span></a></p>
<p>Financial Results <a href="https://evil.example/a.pdf">PDF</a></p>
<p>Policy <a href="/policy.pdf">PDF</a></p>
<p>Q1 Financial Results <a href="/results.pdf"><i></i></a></p>
<article>Published on 23 April 2026 — Earnings Presentation <button data-file="/dated-results.pdf">Download</button></article>`;
const cover = "RKL/SX/2026-27/43 July 28, 2026\n\n**BSE Limited**\nNational Stock Exchange of India Limited\nSymbol: RADICO\nSubject: Earnings Presentation\n" + "Revenue increased according to the unaudited financial results. ".repeat(20);
const links = discoverOfficialDocuments(html, base, domains);
assert.equal(links.length, 3);
assert.equal(links[0].url, pdf);
assert.match(links[0].title!, /Earnings Presentation/);
const datedLink = links.find(link => link.url.endsWith("/dated-results.pdf"));
assert.equal(datedLink?.publishedDate, "2026-04-23");
assert.equal(datedLink?.dateBasis, "official_index_context");
const archive = discoverOfficialDocuments(html + '<p>Press release May 02, 2025 <a href="/2025/pressrelease020525.pdf">PDF</a></p><p>Q3 FY2019 Earnings Call <a href="/2019/CLT_20190122045559.pdf">PDF</a></p>', base, domains);
assert.equal(archive[0].url, pdf);
assert.equal(exactEvidenceDate("July 28, 2026"), "2026-07-28");
assert.equal(exactEvidenceDate("28 July 2026"), "2026-07-28");
assert.equal(exactEvidenceDate("2026-02-30"), null);
assert.equal(exactEvidenceDate("2026-04-23T09:30:00Z"), "2026-04-23");
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
  unwrapOfficialPdfViewerUrl("https://issuer.example/download?file=%2Freports%2Fresults.pdf"),
  "https://issuer.example/reports/results.pdf",
);
assert.equal(
  unwrapOfficialPdfViewerUrl("https://www.marutisuzuki.com/pdf-viewer?pdf=https%3A%2F%2Fevil.example%2Freport.pdf"),
  "https://www.marutisuzuki.com/pdf-viewer?pdf=https%3A%2F%2Fevil.example%2Freport.pdf",
);
assert.equal(
  documentPublicationDate({ markdown: "Official results. ".repeat(20) }, { url: "https://issuer.example/results-2026-04-23.pdf" }).date,
  "2026-04-23",
);
assert.equal(
  documentPublicationDate({ markdown: "Official results. ".repeat(20) }, { url: "https://issuer.example/results_20260423.pdf" }).date,
  "2026-04-23",
);
assert.deepEqual(
  documentPublicationDate(
    { markdown: "Official analyst presentation. ".repeat(20) },
    { url: "https://issuer.example/Presentation_for_Analyst_Meeting_v17072026.pdf" },
  ),
  { date: "2026-07-17", basis: "document_filename" },
);
assert.equal(
  documentPublicationDate(
    { markdown: "Official analyst presentation. ".repeat(20) },
    { url: "https://issuer.example/Presentation_v07102026.pdf" },
  ).date,
  null,
);
assert.deepEqual(
  documentPublicationDate(
    { rawHtml: '<script type="application/ld+json">{"datePublished":"2026-04-23T09:30:00Z"}</script>', markdown: "Official release. ".repeat(20) },
    { url: "https://issuer.example/news/results" },
  ),
  { date: "2026-04-23", basis: "structured_publication_metadata" },
);
assert.deepEqual(
  documentPublicationDate(
    { markdown: "Q1 FY27\nEarnings Presentation\n31st July 2026\nNSE:SUNPHARMA\n" + "Performance highlights. ".repeat(30) },
    { url: "https://issuer.example/Q1FY27-Earnings-Presentation.pdf" },
  ),
  { date: "2026-07-31", basis: "document_title_page" },
);
assert.equal(
  documentPublicationDate(
    { markdown: "Earnings Presentation\nQuarter ended 30.06.2026\nReleased 31.07.2026\n" + "Performance highlights. ".repeat(30) },
    { url: "https://issuer.example/Q1FY27-Earnings-Presentation.pdf" },
  ).date,
  null,
);
assert.deepEqual(
  documentPublicationDate(
    {
      markdown: "BAJAJ AUTO LTD.\nAGM NOTICE\nNotice is hereby given that the Annual General Meeting will be held on 21 July 2026.\n" +
        "Legal notice text without a publication date. ".repeat(700) +
        "The financial year ended 31 March 2026. By order of the Board of Directors For Bajaj Auto Ltd. Rajiv Gandhi Company Secretary Pune: 06 May 2026 " +
        "Shareholder information. ".repeat(30),
    },
    { url: "https://investors.bajajauto.com/ar26/Annual-Report-NoticeProxyAS.pdf" },
  ),
  { date: "2026-05-06", basis: "signed_company_notice" },
);
assert.equal(
  documentPublicationDate(
    {
      markdown: "AGM NOTICE\nThe Annual General Meeting will be held on 21 July 2026.\n" + "Shareholder information. ".repeat(30),
    },
    { url: "https://issuer.example/undated-agm-notice.pdf" },
  ).date,
  null,
);

const calls: string[] = [];
const result = await collectOfficialEvidence([{ url: base }, { url: "https://evil.example/report.pdf" }], domains, "2026-09-05", async url => {
  calls.push(url);
  if (url === base) return { rawHtml: html, markdown: "Investor Relations July 28, 2026" };
  if (url === pdf) return { markdown: cover, metadata: { url } };
  return { markdown: cover.replace("July 28, 2026", "October 28, 2026") };
});
assert.equal(result.sources.length, 2);
assert.equal(result.sources[0].url, pdf);
assert.equal(result.sources[0].publishedAt, "2026-07-28");
assert.equal(result.sources[1].url, "https://radicokhaitan.com/dated-results.pdf");
assert.equal(result.sources[1].publishedAt, "2026-04-23");
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
let transientAttempts = 0;
const transientProxy = await collectOfficialEvidence([{ url: pdf }], domains, "2026-09-05", async (_url, options) => {
  transientAttempts++;
  if (transientAttempts === 1) return { success: false, error: "ERR_TUNNEL_CONNECTION_FAILED internal proxy error" };
  assert.equal(options.proxy, "basic");
  return { markdown: cover };
});
assert.equal(transientAttempts, 2);
assert.equal(transientProxy.sources.length, 1);
const persistentProxy = await collectOfficialEvidence([{ url: pdf }], domains, "2026-09-05", async () => ({
  success: false,
  error: "Firecrawl internal proxy tunnel failed",
}));
assert.equal(persistentProxy.sources.length, 0);
assert.equal(persistentProxy.rejectionReasons.scrape_proxy_failed, 1);
assert.equal(persistentProxy.rejectionReasons.missing_publication_date, undefined);
console.log("PASS: icon-only official PDF discovery, exact filing date, cutoff, undated and untrusted-source rejection.");
