import { isOfficialDossierSource, type DossierSource } from "./dossier";

type Candidate = { url: string; title?: string; publishedDate?: string; date?: string; depth?: number };
type Scraped = { markdown?: string; rawHtml?: string; metadata?: Record<string, any> };
type Scrape = (url: string, options: any) => Promise<Scraped>;

// A publication date must be an actual day, not an upload folder or fiscal year.
export function exactEvidenceDate(value: unknown): string | null {
  const text = String(value || "").replace(/<[^>]*>/g, " ").replace(/[*_]/g, "");
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  let parts: string[] | undefined;
  let m = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
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

// Icon-only anchors have no useful markdown label. Read the surrounding HTML
// paragraph/list item, but use that label for discovery/ranking, NEVER dating.
export function discoverOfficialDocuments(html: string, base: string, domains: string[]): Candidate[] {
  const found = new Map<string, Candidate>();
  for (const match of html.slice(0, 2_000_000).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string;
    try { url = new URL(match[1].replace(/&amp;/g, "&"), base).href; } catch { continue; }
    if (!isPdf(url) || !isOfficialDossierSource(url, domains)) continue;
    const before = html.slice(Math.max(0, match.index! - 400), match.index);
    const block = before.split(/<(?:p|li)\b[^>]*>/i).slice(-1)[0];
    const title = plain(`${block} ${match[2]}`).slice(0, 300);
    if (!/presentation|financial results|earnings|transcript|annual report|press release/i.test(title)) continue;
    if (!found.has(url)) found.set(url, { url, title, depth: 1 });
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
  for (const value of [scraped.metadata?.publishedTime, scraped.metadata?.publishedDate, candidate.publishedDate, candidate.date]) {
    const date = exactEvidenceDate(value);
    if (date) return { date, basis: "publication_metadata" };
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
  const queue: Candidate[] = candidates.map(c => ({ ...c, depth: 0 }));
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
      queue.splice(index + 1, 0, ...links.slice(0, 6));
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
