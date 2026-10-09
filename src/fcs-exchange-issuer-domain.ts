export interface ExchangeIssuerDomainInput {
  /** Final URL of the already downloaded exchange PDF. */
  documentUrl: string;
  companyName: string;
  ticker: string;
  documentText: string;
}

const EXCHANGE_HOSTS = new Set([
  "nseindia.com", "www.nseindia.com", "nsearchives.nseindia.com", "archives.nseindia.com",
  "bseindia.com", "www.bseindia.com",
]);
const EXCLUDED_HOSTS = [
  "nseindia.com", "bseindia.com", "google.com", "googleusercontent.com", "gmail.com",
  "outlook.com", "hotmail.com", "live.com", "yahoo.com", "yahoo.co.in", "aol.com",
  "proton.me", "protonmail.com", "icloud.com", "mail.com", "rediffmail.com",
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "youtube.com",
  "youtu.be", "tiktok.com", "whatsapp.com", "telegram.org", "t.me", "threads.net",
  "blogspot.com", "wordpress.com", "wixsite.com", "weebly.com", "github.io", "pages.dev",
  "vercel.app", "netlify.app", "web.app", "firebaseapp.com", "surge.sh", "duckdns.org",
];
const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function validatedWebsiteOrigins(values: string[]): string[] {
  const domains = new Set<string>();
  for (const supplied of values) {
    const website = new URL(/^www\./i.test(supplied) ? `https://${supplied}` : supplied);
    const host = website.hostname.toLowerCase();
    if (website.protocol !== 'https:' || website.username || website.password || website.port
      || website.pathname !== '/' || website.search || website.hash || host.length > 253
      || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)
      || /\.(?:localhost|local|internal|test|invalid|example|onion)$/.test(host)
      || EXCLUDED_HOSTS.some(blocked => host === blocked || host.endsWith(`.${blocked}`))) return [];
    domains.add(host.replace(/^www\./, ''));
  }
  return domains.size === 1 ? [...domains] : [];
}

/** Regulator-hosted offer covers may predate a listing symbol. Identity only,
 * never current financial evidence; require an exact legal-name heading and CIN. */
export function regulatorIssuerDomainHints(input: ExchangeIssuerDomainInput): string[] {
  try {
    const url = new URL(input.documentUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !['sebi.gov.in', 'www.sebi.gov.in'].includes(url.hostname.toLowerCase())
      || !/^\/(?:cms\/)?sebi_data\/attachdocs\/[^/]+\.pdf$/i.test(url.pathname)) return [];
    const cover = input.documentText.slice(0, 8000);
    const legalName = normalizeName(input.companyName);
    if (legalName.length < 5 || !legalName.includes(' ')
      || !cover.split(/\r?\n/).some(line => normalizeName(line) === legalName)
      || !/\b(?:red\s+herring\s+)?prospectus\b/i.test(cover)
      || !/\b(?:Corporate\s+Identi(?:ty|fication)\s+Number|CIN)\s*[:：]\s*[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/i.test(cover)) return [];
    const websites = [...cover.matchAll(/\bWebsite\s*[:：]\s*(https:\/\/[^\s;]+|www\.[^\s;]+)/gi)];
    if (!websites.length) return [];
    return validatedWebsiteOrigins(websites.map(match => match[1]));
  } catch { return []; }
}

/** Metadata hints only: this does not authenticate later downloads or admit evidence. */
export function exchangeIssuerDomainHints(input: ExchangeIssuerDomainInput): string[] {
  try {
    const document = new URL(input.documentUrl);
    if (document.protocol !== "https:" || document.username || document.password || document.port
      || !EXCHANGE_HOSTS.has(document.hostname.toLowerCase()) || !/\.pdf$/i.test(document.pathname)) return [];
    const ticker = input.ticker.trim().toUpperCase();
    const name = normalizeName(input.companyName);
    if (!/^[A-Z0-9&.-]{1,24}$/.test(ticker) || name.length < 5 || !name.includes(" ")) return [];
    const cover = input.documentText.slice(0, 4000);
    if (!(` ${normalizeName(cover)} `).includes(` ${name} `)) return [];
    const symbols = [...cover.matchAll(/^\s*NSE\s+(?:Scrip\s+)?(?:Symbol|Code)\s*:\s*([A-Z0-9&.-]+)\s*$/gim)]
      .map(match => match[1].toUpperCase());
    if (!symbols.length || symbols.some(symbol => symbol !== ticker)) return [];
    const websites = [...cover.matchAll(/^\s*Website\s*:\s*(https:\/\/[^\s]+|www\.[^\s]+)\s*$/gim)];
    if (!websites.length) return [];
    return validatedWebsiteOrigins(websites.map(match => match[1]));
  } catch {
    return [];
  }
}
