import { isOfficialDossierSource, type DossierSource } from "./dossier";

type Candidate = { url: string; title?: string; publishedDate?: string; date?: string; dateBasis?: string; depth?: number };
type Scraped = { markdown?: string; rawHtml?: string; metadata?: Record<string, any> };
type Scrape = (url: string, options: any) => Promise<Scraped>;

// A publication date must be an actual day, not an upload folder or fiscal year.
export function exactEvidenceDate(value: unknown): string | null {
  const text = String(value || "").replace(/<[^>]*>/g, " ").replace(/[*_]/g, "");
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  let parts: string[] | undefined;
  let m = text.match(/(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/);
  if (m) parts = [m[1], m[2], m[3]];
  if (!parts) {
    m = text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](20\d{2})\b/);
    if (m) parts = [m[3], m[2], m[1]];
  }
  if (!parts) {
    m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s*,?\s*(20\d{2})\b/i);
    if (m) parts = [m[3], String(months.indexOf(m[2].slice(0, 3).toLowerCase()) + 1), m[1]];
  }
  if (!parts) {
    m = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(20\d{2})\b/i);
    if (m) parts = [m[3], String(months.indexOf(m[1].slice(0, 3).toLowerCase()) + 1), m[2]];
  }
  if (!parts) return null;
  const iso = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

const plain = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp);/g, " ").replace(/\s+/g, " ").trim();
const isPdf = (url: string) => /\.pdf(?:[?#]|$)/i.test(url);

// Some issuer sites expose PDFs through a same-origin viewer URL. Scrape the
// underlying document, but never follow a viewer parameter to another origin.
export function unwrapOfficialPdfViewerUrl(value: string): string {
  try {
    const viewer = new URL(value);
    for (const key of ["pdf", "file", "document", "doc", "download", "url"]) {
      const wrapped = viewer.searchParams.get(key);
      if (!wrapped || !/\.pdf(?:[?#]|$)/i.test(wrapped)) continue;
      const direct = new URL(wrapped, viewer.origin);
      if (direct.origin === viewer.origin) return direct.href;
    }
    return viewer.href;
  } catch {
    return value;
  }
}

function containingBlock(html: string, start: number, end: number): string {
  const lower = html.toLowerCase();
  let bestStart = -1;
  let bestEnd = -1;
  for (const tag of ["tr", "li", "p", "article"]) {
    const open = lower.lastIndexOf(`<${tag}`, start);
    if (open < 0 || lower.indexOf(`</${tag}>`, open) < start) continue;
    const close = lower.indexOf(`</${tag}>`, end);
    if (close >= 0 && open > bestStart && close - open < 5000) {
      bestStart = open;
      bestEnd = close + tag.length + 3;
    }
  }
  return bestStart >= 0 ? html.slice(bestStart, bestEnd) : html.slice(Math.max(0, start - 400), Math.min(html.length, end + 400));
}

function exactIndexContextDate(attributes: string, block: string): string | null {
  for (const name of ["datetime", "data-date", "data-published", "data-published-at"]) {
    const value = attributes.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
    const date = exactEvidenceDate(value);
    if (date) return date;
  }
  for (const time of block.matchAll(/<time\b[^>]*datetime\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const date = exactEvidenceDate(time[1]);
    if (date) return date;
  }
  const labelled = plain(block).match(/\b(?:published(?:\s+on)?|publication date|release date|dated)\s*[:\-]?\s*(.{0,60})/i);
  return exactEvidenceDate(labelled?.[1]);
}

// Icon-only controls have no useful markdown label. Read the containing official
// index block for discovery/ranking and only accept structured or explicitly
// labelled publication dates tied to that same block.
export function discoverOfficialDocuments(html: string, base: string, domains: string[]): Candidate[] {
  const found = new Map<string, Candidate>();
  const documentHtml = html.slice(0, 2_000_000);
  for (const match of documentHtml.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const attributes = match[2];
    const rawUrl = attributes.match(/\b(?:href|data-href|data-url|data-file)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!rawUrl) continue;
    let url: string;
    try { url = unwrapOfficialPdfViewerUrl(new URL(rawUrl.replace(/&amp;/g, "&"), base).href); } catch { continue; }
    if (!isPdf(url) || !isOfficialDossierSource(url, domains)) continue;
    const block = containingBlock(documentHtml, match.index!, match.index! + match[0].length);
    const title = plain(block).slice(0, 300);
    if (!/presentation|financial results|earnings|transcript|annual report|press release/i.test(title)) continue;
    const publishedDate = exactIndexContextDate(attributes, block) || undefined;
    if (!found.has(url)) found.set(url, { url, title, publishedDate, dateBasis: publishedDate ? "official_index_context" : undefined, depth: 1 });
  }
  const score = (c: Candidate) => {
    // Do not mistake digits inside document IDs (e.g. 020525 or timestamps)
    // for future years and rank an old archive above current filings.
    const year = Math.max(0, ...(`${c.title} ${new URL(c.url).pathname}`.match(/(?<!\d)20\d{2}(?!\d)/g) || []).map(Number));
    return year * 10 + (/earnings.*presentation|financial results/i.test(c.title || "") ? 5 : /presentation/i.test(c.title || "") ? 4 : /transcript/i.test(c.title || "") ? 3 : 1);
  };
  return [...found.values()].sort((a, b) => score(b) - score(a));
}

export function documentPublicationDate(scraped: Scraped, candidate: Candidate): { date: string | null; basis: string } {
  for (const [value, basis] of [
    [scraped.metadata?.publishedTime, "publication_metadata"],
    [scraped.metadata?.publishedDate, "publication_metadata"],
    [scraped.metadata?.datePublished, "publication_metadata"],
    [scraped.metadata?.articlePublishedTime, "publication_metadata"],
    [candidate.publishedDate, candidate.dateBasis || "search_result_date"],
    [candidate.date, candidate.dateBasis || "search_result_date"],
  ] as Array<[unknown, string]>) {
    const date = exactEvidenceDate(value);
    if (date) return { date, basis };
  }
  const structuredHtml = String(scraped.rawHtml || "").slice(0, 150_000);
  for (const match of structuredHtml.matchAll(/["']datePublished["']\s*:\s*["']([^"']+)["']/gi)) {
    const date = exactEvidenceDate(match[1]);
    if (date) return { date, basis: "structured_publication_metadata" };
  }
  for (const match of structuredHtml.matchAll(/<meta\b([^>]+)>/gi)) {
    const attributes = match[1];
    const name = attributes.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!name || !/^(?:article:published_time|date|datePublished)$/i.test(name)) continue;
    const value = attributes.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
    const date = exactEvidenceDate(value);
    if (date) return { date, basis: "structured_publication_metadata" };
  }
  const lines = String(scraped.markdown || "").slice(0, 2400).split(/\n/);
  for (const line of lines) {
    if (/\b(?:date|dated|published|publication date)\s*[:\-]/i.test(plain(line))) {
      const date = exactEvidenceDate(line);
      if (date) return { date, basis: "labelled_publication_date" };
    }
  }
  // Stock-exchange cover letters place their filing date at the top, before
  // the recipient/subject. Never search the report body for a reporting-period date.
  if (isPdf(candidate.url)) {
    // Some issuers publish undated PDF text but encode an exact release date in
    // the filename (for example, q4-apr23-2026.pdf). Accept only an explicit
    // day-month-year filename pattern; quarter/year folders remain insufficient.
    const filename = decodeURIComponent(new URL(candidate.url).pathname.split("/").pop() || "");
    const filenameDate = exactEvidenceDate(filename.replace(/_/g, " "));
    if (filenameDate) return { date: filenameDate, basis: "document_filename" };
    const compactUrlDate = filename.match(/(?:^|[-_])(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(\d{1,2})[-_](20\d{2})(?:[-_.]|$)/i);
    if (compactUrlDate) {
      const date = exactEvidenceDate(`${compactUrlDate[2]} ${compactUrlDate[1]} ${compactUrlDate[3]}`);
      if (date) return { date, basis: "document_filename" };
    }
    const compactNumericDate = filename.match(/(?:^|\D)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:\D|$)/);
    if (compactNumericDate) {
      const date = exactEvidenceDate(`${compactNumericDate[1]}-${compactNumericDate[2]}-${compactNumericDate[3]}`);
      if (date) return { date, basis: "document_filename" };
    }
    const cover = String(scraped.markdown || "").slice(0, 1800);
    const recipient = cover.search(/\b(?:BSE Limited|National Stock Exchange|To,?\s*\n)/i);
    if (recipient >= 0 && /\b(?:subject|scrip|symbol|regulation)\b/i.test(cover)) {
      const date = exactEvidenceDate(cover.slice(0, Math.min(recipient, 500)));
      if (date) return { date, basis: "exchange_cover_letter" };
    }
  }
  return { date: null, basis: "none" };
}

export async function collectOfficialEvidence(candidates: Candidate[], domains: string[], cutoff: string, scrape: Scrape) {
  const queue: Candidate[] = candidates.map(c => ({ ...c, url: unwrapOfficialPdfViewerUrl(c.url), depth: 0 }));
  const seen = new Set<string>();
  const sources: DossierSource[] = [];
  const evidence: Array<{ sourceId: string; text: string }> = [];
  const diagnostics: Array<{ url: string; outcome: string; date?: string; dateBasis?: string }> = [];
  const rejectionReasons: Record<string, number> = {};
  let discoveryPages = 0;
  let documentAttempts = 0;
  const reject = (url: string, outcome: string) => {
    rejectionReasons[outcome] = (rejectionReasons[outcome] || 0) + 1;
    diagnostics.push({ url, outcome });
  };
  for (let index = 0; index < queue.length && sources.length < 3; index++) {
    const candidate = queue[index];
    const url = candidate.url;
    if (!isOfficialDossierSource(url, domains)) { reject(url, "unverified_domain"); continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    if (isPdf(url)) { if (++documentAttempts > 4) break; }
    else if (++discoveryPages > 2) continue;
    let scraped: Scraped;
    try {
      scraped = await scrape(url, { formats: isPdf(url) ? ["markdown"] : ["markdown", "rawHtml"], onlyMainContent: true, timeout: 45000 });
    } catch { reject(url, "scrape_failed"); continue; }
    const finalUrl = scraped.metadata?.url || scraped.metadata?.sourceURL || url;
    if (!isOfficialDossierSource(finalUrl, domains)) { reject(url, "unverified_redirect"); continue; }
    if (Number(scraped.metadata?.statusCode || 200) >= 400) { reject(url, "source_http_error"); continue; }
    const links = !candidate.depth ? discoverOfficialDocuments(scraped.rawHtml || "", url, domains) : [];
    if (links.length) {
      queue.splice(index + 1, 0, ...links.slice(0, 6).map(c => ({ ...c, url: unwrapOfficialPdfViewerUrl(c.url) })));
      diagnostics.push({ url, outcome: "discovery_index" });
      continue; // An index is not the report and cannot inherit report dates.
    }
    const text = String(scraped.markdown || "").replace(/\s+/g, " ").trim().slice(0, 18000);
    if (text.length < 200) { reject(url, "thin_content"); continue; }
    const { date, basis } = documentPublicationDate(scraped, candidate);
    if (!date) { reject(url, "missing_publication_date"); continue; }
    if (date > cutoff) { reject(url, "post_cutoff"); continue; }
    const host = new URL(url).hostname.toLowerCase();
    const sourceId = `official-${String(sources.length + 1).padStart(3, "0")}`;
    const sourceClass = host.endsWith("sebi.gov.in") ? "regulator" : (host.endsWith("nseindia.com") || host.endsWith("bseindia.com")) ? "exchange" : "company_official";
    sources.push({ sourceId, url, sourceClass, publishedAt: date, retrievedAt: new Date().toISOString() });
    evidence.push({ sourceId, text });
    diagnostics.push({ url, outcome: "admitted", date, dateBasis: basis });
  }
  return { sources, evidence, diagnostics, rejectionReasons, candidateCount: candidates.length, discoveredCount: queue.length - candidates.length };
}
