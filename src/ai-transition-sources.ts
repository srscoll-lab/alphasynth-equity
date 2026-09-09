export type DisclosureSourceType = "results" | "earnings_transcript" | "investor_presentation" | "annual_report" | "exchange_filing";

export type DiscoveredDisclosure = {
  url: string;
  label: string;
  sourceType: DisclosureSourceType;
};

const decodeHtml = (value: string) => value
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", "\"")
  .replaceAll("&#39;", "'")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export function isOfficialDisclosureUrl(rawUrl: string, officialDomains: string[]) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
    return officialDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function isWithinStudyWindow(labelAndUrl: string, firstFiscalYear = 2023) {
  const value = labelAndUrl.toLowerCase();
  const years = [...value.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  const fiscalYears = [...value.matchAll(/\bfy[-_ ]?(?:20)?(\d{2})\b/g)].map((match) => 2000 + Number(match[1]));
  const observed = [...years, ...fiscalYears];
  return observed.length === 0 || Math.max(...observed) >= firstFiscalYear;
}

function sourceType(labelAndUrl: string): DisclosureSourceType | null {
  const value = labelAndUrl.toLowerCase();
  if (/transcript|earnings[-_ ]?call|conference[-_ ]?call/.test(value)) return "earnings_transcript";
  if (/investor[-_ ]?(presentation|deck)|analyst[-_ ]?presentation|fact[-_ ]?sheet/.test(value)) return "investor_presentation";
  if (/annual[-_ ]?report|integrated[-_ ]?report/.test(value)) return "annual_report";
  if (/financial[-_ ]?results?|quarterly[-_ ]?results?|earnings[-_ ]?(release|announcement)|q[1-4].{0,18}results?/.test(value)) return "results";
  if (/regulation[-_ ]?30|outcome[-_ ]?of[-_ ]?(the[-_ ]?)?board.{0,24}financial|exchange[-_ ]?filing/.test(value)) return "exchange_filing";
  return null;
}

export function discoverOfficialDisclosures(html: string, baseUrl: string, officialDomains: string[]) {
  const found = new Map<string, DiscoveredDisclosure>();
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    let url: string;
    try { url = new URL(decodeHtml(match[1]), baseUrl).toString(); } catch { continue; }
    if (!isOfficialDisclosureUrl(url, officialDomains)) continue;
    const label = decodeHtml(match[2]) || "Official disclosure";
    const classified = sourceType(`${label} ${url}`);
    if (!classified) continue;
    const normalized = url.split("#")[0];
    if (!found.has(normalized)) found.set(normalized, { url: normalized, label, sourceType: classified });
  }
  return [...found.values()];
}
