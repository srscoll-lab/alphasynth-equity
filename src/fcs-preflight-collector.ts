import { publicationDateSupported } from "./fcs-publication-date.ts";
import type { RetrievedGroundedDocument } from "./fcs-grounded-document-retrieval.ts";
import type { FcsPreflightEvidenceApproval } from "./fcs-evidence-preflight.ts";

export const FCS_PREFLIGHT_FACTOR_FAMILIES = ["earnings", "economics", "execution", "balance_sheet"] as const;

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

function validIsoDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function literalDates(text: string): string[] {
  const dates = new Set<string>();
  for (const match of text.matchAll(/\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/g)) dates.add(`${match[1]}-${match[2]}-${match[3]}`);
  for (const match of text.matchAll(/\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(20\d{2})\b/gi)) {
    dates.add(`${match[3]}-${MONTHS[match[2].toLowerCase()]}-${String(Number(match[1])).padStart(2, "0")}`);
  }
  for (const match of text.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?,?\s+(20\d{2})\b/gi)) {
    dates.add(`${match[3]}-${MONTHS[match[1].toLowerCase()]}-${String(Number(match[2])).padStart(2, "0")}`);
  }
  return [...dates].filter(validIsoDate);
}

export function reportedQuarterEnds(text: string): string[] {
  const ends = new Set<string>();
  const patterns = [
    /(?:quarter|three\s+months|period)\s+ended\s+(?:on\s+)?(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+(March|June|September|December),?\s+(20\d{2})/gi,
    /(?:quarter|three\s+months|period)\s+ended\s+(?:on\s+)?(March|June|September|December)\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?,?\s+(20\d{2})/gi,
    /(?:quarter|three\s+months|period)\s+ended\s+(?:on\s+)?(20\d{2})[-/](03|06|09|12)[-/](30|31)/gi,
  ];
  for (const match of text.matchAll(patterns[0])) ends.add(`${match[3]}-${MONTHS[match[2].toLowerCase()]}-${String(Number(match[1])).padStart(2, "0")}`);
  for (const match of text.matchAll(patterns[1])) ends.add(`${match[3]}-${MONTHS[match[1].toLowerCase()]}-${String(Number(match[2])).padStart(2, "0")}`);
  for (const match of text.matchAll(patterns[2])) ends.add(`${match[1]}-${match[2]}-${match[3]}`);
  return [...ends].filter((date) => validIsoDate(date) && /-(03-31|06-30|09-30|12-31)$/.test(date));
}

const NUMBER = String.raw`(?:₹|Rs\.?|INR|US\$|USD)?\s*[-+]?\d[\d,]*(?:\.\d+)?\s*(?:%|crore|cr|million|billion|mn|bn|bps|x)?`;
const FAMILY_TERMS: Record<(typeof FCS_PREFLIGHT_FACTOR_FAMILIES)[number], RegExp> = {
  earnings: /\b(?:revenue|sales|profit|PAT|EPS|EBITDA|operating\s+profit|net\s+income)\b/i,
  economics: /\b(?:margin|spread|realisation|realization|yield|unit\s+economics|pricing|cost\s+per\s+unit)\b/i,
  execution: /\b(?:order\s+book|order\s+inflow|volume|capacity\s+utili[sz]ation|production|deal\s+TCV|deal\s+wins?|client\s+additions?|market\s+share|dispatches|launches|projects?\s+(?:executed|delivered))\b/i,
  balance_sheet: /\b(?:net\s+debt|gross\s+debt|cash\s+flow|free\s+cash|working\s+capital|receivables?|inventory|capital\s+adequacy|GNPA|NNPA|asset\s+quality|liquidity|interest\s+coverage)\b/i,
};

export function detectedFactorFamilies(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ");
  return FCS_PREFLIGHT_FACTOR_FAMILIES.filter((family) => {
    const term = FAMILY_TERMS[family];
    for (const match of normalized.matchAll(new RegExp(term.source, "ig"))) {
      const nearby = normalized.slice(Math.max(0, match.index! - 120), Math.min(normalized.length, match.index! + match[0].length + 120));
      if (new RegExp(NUMBER, "i").test(nearby)) return true;
    }
    return false;
  });
}

type DatedDocument = RetrievedGroundedDocument & { periodEnd: string; publishedAt: string };

export function qualifyPreflightDocuments(input: {
  symbol: string;
  checkedAt: string;
  cutoff: string;
  trustedIssuerDomains: readonly string[];
  documents: readonly RetrievedGroundedDocument[];
}): { approval: FcsPreflightEvidenceApproval | null; reasons: string[] } {
  const trusted = (raw: string) => {
    try {
      const url = new URL(raw);
      return url.protocol === "https:" && !url.username && !url.password && !url.port
        && input.trustedIssuerDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
    } catch { return false; }
  };
  const dated: DatedDocument[] = [];
  for (const document of input.documents) {
    if (!trusted(document.sourceUrl) || document.text.trim().length < 500) continue;
    for (const periodEnd of reportedQuarterEnds(document.text)) {
      const publishedAt = literalDates(document.text.slice(0, 5000))
        .filter((date) => date <= input.cutoff && publicationDateSupported(document.text, date, periodEnd))
        .sort().at(-1);
      if (publishedAt) dated.push({ ...document, periodEnd, publishedAt });
    }
  }
  dated.sort((left, right) => right.periodEnd.localeCompare(left.periodEnd));
  const current = dated[0];
  const comparable = current && dated.find((document) => document.sha256 !== current.sha256
    && document.periodEnd === `${Number(current.periodEnd.slice(0, 4)) - 1}${current.periodEnd.slice(4)}`);
  if (!current || !comparable) return { approval: null, reasons: ["verified_current_and_comparable_documents_not_found"] };
  const factors = detectedFactorFamilies(`${current.text}\n${comparable.text}`);
  if (factors.length !== 4) return { approval: null, reasons: ["four_factor_family_coverage_incomplete", ...FCS_PREFLIGHT_FACTOR_FAMILIES.filter((factor) => !factors.includes(factor)).map((factor) => `missing_${factor}`)] };
  return {
    approval: {
      symbol: input.symbol,
      checkedAt: input.checkedAt,
      evidenceCutoff: input.cutoff,
      currentDocument: { url: current.sourceUrl, publishedAt: current.publishedAt, readable: true, official: true },
      comparableDocument: { url: comparable.sourceUrl, publishedAt: comparable.publishedAt, readable: true, official: true },
      factorFamilies: [...FCS_PREFLIGHT_FACTOR_FAMILIES],
    },
    reasons: [],
  };
}
