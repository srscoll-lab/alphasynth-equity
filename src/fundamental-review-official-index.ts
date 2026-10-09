// Issuer adapters locate documents; they never supply financial values or invent dates.
import { discoverHclSources } from './hcl-quarter-index.ts';
import { discoverWiproSources } from './wipro-quarter-index.ts';
import { periods as techmReviewedPeriods } from './techm-reviewed-quarter-ledger.ts';
import { persistentReviewedPeriods } from './persistent-reviewed-quarter-ledger.ts';
import { coforgeReviewedPeriods } from './coforge-reviewed-quarter-ledger.ts';
import { tcsReviewedPeriods } from './tcs-reviewed-quarter-ledger.ts';
export type OfficialIndexedSource = { url: string; published_at: string; source_type: "company_filing"; period_end?: string };
export function infosysQuarterIndex(periodEnd: string): string | null {
  const match = /^(\d{4})-(03-31|06-30|09-30|12-31)$/.exec(periodEnd);
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = ({ "03-31": 4, "06-30": 1, "09-30": 2, "12-31": 3 } as Record<string, number>)[match[2]];
  const start = quarter === 4 ? year - 1 : year;
  return `https://www.infosys.com/investors/reports-filings/quarterly-results/${start}-${start + 1}/q${quarter}.html`;
}
export function sourcesFromInfosysIndex(html: string, indexUrl: string, cutoff: string): OfficialIndexedSource[] {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  // Use the issuer's explicit announcement date, not file modification/capture time.
  const match = /announces results.{0,160}?on\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})/i.exec(text);
  if (!match) return [];
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const month = months.indexOf(match[1].toLowerCase());
  if (month < 0) return [];
  const date = `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  if (date > cutoff) return [];
  const urls = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].flatMap(match => {
    try {
      const url = new URL(match[1].replace(/&amp;/g, "&"), indexUrl);
      return url.hostname === "www.infosys.com" && /\/documents\/(ifrs-usd-press-release|fact-sheet)\.pdf$/i.test(url.pathname) ? [url.href] : [];
    } catch { return []; }
  });
  return [...new Set(urls)].map(url => ({ url, published_at: date, source_type: "company_filing" }));
}
export async function discoverIndexedOfficialSources(symbol: string, periodEnd: string, cutoff: string, fetchImpl: typeof fetch = fetch): Promise<OfficialIndexedSource[]> {
  if (symbol === "TCS") {
    const end = periodEnd || Object.keys(tcsReviewedPeriods).filter(period => tcsReviewedPeriods[period].date <= cutoff).sort().at(-1) || "";
    const entry = tcsReviewedPeriods[end];
    return entry && entry.date <= cutoff ? [{ url: entry.file, published_at: entry.date, source_type: "company_filing", period_end: end }] : [];
  }
  if (symbol === "COFORGE") {
    const end = periodEnd || Object.keys(coforgeReviewedPeriods).filter(period => coforgeReviewedPeriods[period].date <= cutoff).sort().at(-1) || "";
    const entry = coforgeReviewedPeriods[end];
    return entry && entry.date <= cutoff ? [{ url: entry.file, published_at: entry.date, source_type: "company_filing", period_end: end }] : [];
  }
  if (symbol === "PERSISTENT") {
    const end = periodEnd || Object.keys(persistentReviewedPeriods).filter(period => persistentReviewedPeriods[period].date <= cutoff).sort().at(-1) || "";
    const entry = persistentReviewedPeriods[end];
    return entry && entry.date <= cutoff ? [{ url: entry.file, published_at: entry.date, source_type: "company_filing", period_end: end }] : [];
  }
  if (symbol === "TECHM") {
    const end=periodEnd||Object.keys(techmReviewedPeriods).filter(p=>techmReviewedPeriods[p].date<=cutoff).sort().at(-1)||"";
    const entry=techmReviewedPeriods[end];if(!entry||entry.date>cutoff)return [];
    const files=[entry.file,...(end==='2026-03-31'?['tml-q4-fy-26-earnings-presentation.pdf']:[])];
    return files.map(file=>({url:'https://insights.techmahindra.com/investors/'+file,published_at:entry.date,source_type:'company_filing',period_end:end}));
  }
  if (symbol === "WIPRO") return discoverWiproSources(periodEnd,cutoff,fetchImpl);
  if (symbol === "HCLTECH") return discoverHclSources(periodEnd,cutoff,fetchImpl);
  if (symbol === "LT") return discoverLarsenOfficialSources(periodEnd, cutoff, fetchImpl);
  if (symbol !== "INFY") return [];
  if (!periodEnd) {
    const date = new Date(`${cutoff}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) return [];
    let end = new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 0));
    // The latest calendar quarter may not have been announced yet. At most one fallback.
    for (let attempt = 0; attempt < 2; attempt++) {
      const found = await discoverIndexedOfficialSources(symbol, end.toISOString().slice(0, 10), cutoff, fetchImpl);
      if (found.length) return found;
      end = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 2, 0));
    }
    return [];
  }
  const index = infosysQuarterIndex(periodEnd);
  if (!index) return [];
  try {
    const response = await fetchImpl(index, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok || new URL(response.url || index).hostname !== "www.infosys.com") return [];
    const html = await response.text();
    if (html.length > 2_000_000) return [];
    return sourcesFromInfosysIndex(html, index, cutoff).map(source => ({ ...source, period_end: periodEnd }));
  } catch { return []; }
}

const LT_DOWNLOADS = "https://investors.larsentoubro.com/download.aspx";
const LT_EVENTS = "https://investors.larsentoubro.com/Events.aspx";
/** Dates come from issuer corporate-result events, never PDF filenames or capture time.
 * Calendar events only establish a candidate publication date. The evidence validator
 * still requires the downloaded document to contain the requested reporting period.
 */
export function sourcesFromLarsenIndexes(downloads: string, events: string, periodEnd: string, cutoff: string): OfficialIndexedSource[] {
  if (!/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(periodEnd)) return [];
  const year = Number(periodEnd.slice(0, 4)), month = Number(periodEnd.slice(5, 7));
  const quarter = ({3:4,6:1,9:2,12:3} as Record<number,number>)[month];
  const fiscalEnd = month === 3 ? year : year + 1;
  const publicationDates = [...events.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(row => {
    const date = /id=["']gridCorporate_lblResultDate_\d+["'][^>]*>\s*(\d{2})\/(\d{2})\/(\d{4})\s*</i.exec(row[1]);
    const title = /id=["']gridCorporate_lblTitle_\d+["'][^>]*>([\s\S]*?)<\/span>/i.exec(row[1]);
    if (!date || !title) return [];
    const text = title[1].replace(/<[^>]*>/g," ").trim();
    const matches = quarter === 4
      ? new RegExp(`Annual Results for the year ended March 31,?\\s*${year}`,"i").test(text)
      : new RegExp(`^${({1:"First",2:"Second",3:"Third"} as Record<number,string>)[quarter]} Quarter Results$`,"i").test(text);
    const published = `${date[3]}-${date[2]}-${date[1]}`;
    // Quarterly releases should follow this quarter, before the next quarter ends.
    const latest = new Date(Date.UTC(year, month + 3, 0)).toISOString().slice(0,10);
    return matches && published > periodEnd && published <= latest && published <= cutoff ? [published] : [];
  });
  if (new Set(publicationDates).size !== 1) return [];
  const decoded = downloads.replace(/&#39;|&apos;/gi,"'").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"');
  const urls = [...decoded.matchAll(/fnDownloadpdf\(\s*['"]([^'"]+)['"]\s*\)/gi)].flatMap(match => {
    try {
      const url = new URL(match[1],LT_DOWNLOADS);
      const pathname = decodeURIComponent(url.pathname);
      const correctQuarter = new RegExp(`FY${fiscalEnd}AnalystPres.*Q${quarter}\\s*FY${String(fiscalEnd).slice(-2)}\\b`,"i").test(pathname);
      return url.protocol === "https:" && url.hostname === "investors.larsentoubro.com"
        && pathname.startsWith("/upload/AnalystPres/") && /\.pdf$/i.test(pathname) && correctQuarter ? [url.href] : [];
    } catch { return []; }
  });
  return [...new Set(urls)].map(url=>({url,published_at:publicationDates[0],source_type:"company_filing",period_end:periodEnd}));
}

async function discoverLarsenOfficialSources(periodEnd: string, cutoff: string, fetchImpl: typeof fetch): Promise<OfficialIndexedSource[]> {
  try {
    const pages = await Promise.all([LT_DOWNLOADS,LT_EVENTS].map(async url=>{
      const response = await fetchImpl(url,{signal:AbortSignal.timeout(12_000)});
      if (!response.ok || new URL(response.url || url).hostname !== "investors.larsentoubro.com") throw new Error("Issuer index unavailable");
      const html = await response.text();
      if (html.length > 2_000_000) throw new Error("Issuer index exceeds bound");
      return html;
    }));
    if (periodEnd) return sourcesFromLarsenIndexes(pages[0],pages[1],periodEnd,cutoff);
    const date = new Date(`${cutoff}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) return [];
    let end = new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth()/3)*3,0));
    for (let attempt=0;attempt<2;attempt++) {
      const found=sourcesFromLarsenIndexes(pages[0],pages[1],end.toISOString().slice(0,10),cutoff);
      if (found.length) return found;
      end=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-2,0));
    }
    return [];
  } catch { return []; }
}
