export type DossierClaimStatus = "supported" | "conflict" | "insufficient_evidence";

export interface DossierSource {
  sourceId: string;
  url: string;
  sourceClass: "exchange" | "company_official" | "regulator" | "social" | "publisher";
  publishedAt: string | null;
  retrievedAt: string;
}

export interface DossierClaim {
  claimId: string;
  text: string;
  sourceIds: string[];
  status: DossierClaimStatus;
}

export interface ResearchDossier {
  schemaVersion: "1.0.0";
  reportId: string;
  generatedAt: string;
  company: {
    symbol: string;
    name: string;
    exchange: "NSE" | "BSE" | "NSE_BSE";
    sector: string;
    officialDomains: string[];
  };
  sections: {
    snapshot: DossierClaim[];
    developments: DossierClaim[];
    operatingEvidence: DossierClaim[];
    managementCommitments: DossierClaim[];
    risks: DossierClaim[];
  };
  sources: DossierSource[];
  marketConversation: {
    status: "available" | "insufficient_data" | "disabled";
    affectsBms: false;
    sampleSize: number;
    sentiment: { positive: number; neutral: number; negative: number };
    themes: Array<{
      label: string;
      stance: "bullish" | "bearish" | "mixed" | "neutral";
      sourceIds: string[];
    }>;
  };
  qualityControl: {
    unsupportedClaims: number;
    conflicts: number;
    humanReviewRequired: boolean;
  };
}

const TRUSTED_PUBLIC_DOMAINS = [
  "nseindia.com",
  "nsearchives.nseindia.com",
  "bseindia.com",
  "sebi.gov.in",
];

function hostnameMatches(hostname: string, domain: string) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const allowed = domain.toLowerCase().replace(/^www\./, "");
  return host === allowed || host.endsWith(`.${allowed}`);
}

export function isOfficialDossierSource(url: string, officialDomains: string[]) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return [...TRUSTED_PUBLIC_DOMAINS, ...officialDomains]
      .some((domain) => hostnameMatches(parsed.hostname, domain));
  } catch {
    return false;
  }
}

export function isResearchDossier(value: unknown): value is ResearchDossier {
  if (!value || typeof value !== "object") return false;
  const dossier = value as Partial<ResearchDossier>;
  if (!(dossier.schemaVersion === "1.0.0"
    && typeof dossier.reportId === "string"
    && !!dossier.company?.symbol
    && Array.isArray(dossier.company.officialDomains)
    && !!dossier.sections
    && Array.isArray(dossier.sources)
    && dossier.marketConversation?.affectsBms === false
    && !!dossier.qualityControl)) return false;

  const sourceIds = new Set(dossier.sources.map((source) => source.sourceId));
  if (sourceIds.size !== dossier.sources.length) return false;

  const claims = Object.values(dossier.sections).flat();
  if (claims.some((claim) => claim.sourceIds.some((id) => !sourceIds.has(id)))) return false;

  const officialClasses = new Set(["exchange", "company_official", "regulator"]);
  if (dossier.sources.some((source) => officialClasses.has(source.sourceClass)
    && !isOfficialDossierSource(source.url, dossier.company.officialDomains))) return false;

  const sentiment = dossier.marketConversation.sentiment;
  const sentimentTotal = sentiment.positive + sentiment.neutral + sentiment.negative;
  return sentimentTotal >= 0.999 && sentimentTotal <= 1.001;
}
