export interface DossierCompanyProfile {
  ticker: string;
  companyName: string;
  officialDomains: string[];
  exchange: "NSE";
  sector: string;
}

const PILOT_COMPANIES: Record<string, DossierCompanyProfile> = {
  RELIANCE: {
    ticker: "RELIANCE",
    companyName: "Reliance Industries Limited",
    officialDomains: ["ril.com"],
    exchange: "NSE",
    sector: "Diversified Conglomerate",
  },
  RADICO: {
    ticker: "RADICO",
    companyName: "Radico Khaitan Limited",
    officialDomains: ["radicokhaitan.com"],
    exchange: "NSE",
    sector: "Alcoholic Beverages",
  },
  INFY: {
    ticker: "INFY",
    companyName: "Infosys Limited",
    officialDomains: ["infosys.com"],
    exchange: "NSE",
    sector: "Information Technology",
  },
  MARUTI: {
    ticker: "MARUTI",
    companyName: "Maruti Suzuki India Limited",
    officialDomains: ["marutisuzuki.com"],
    exchange: "NSE",
    sector: "Automobiles",
  },
  "BAJAJ-AUTO": {
    ticker: "BAJAJ-AUTO",
    companyName: "Bajaj Auto Limited",
    officialDomains: ["bajajauto.com"],
    exchange: "NSE",
    sector: "Automobiles",
  },
  TITAN: {
    ticker: "TITAN",
    companyName: "Titan Company Limited",
    officialDomains: ["titancompany.in"],
    exchange: "NSE",
    sector: "Consumer Durables",
  },
  SUNPHARMA: {
    ticker: "SUNPHARMA",
    companyName: "Sun Pharmaceutical Industries Limited",
    officialDomains: ["sunpharma.com"],
    exchange: "NSE",
    sector: "Pharmaceuticals",
  },
  IRCTC: {
    ticker: "IRCTC",
    companyName: "Indian Railway Catering and Tourism Corporation Limited",
    officialDomains: ["irctc.com"],
    exchange: "NSE",
    sector: "Travel Services",
  },
};

export function dossierCompanyProfile(ticker: string): DossierCompanyProfile | null {
  return PILOT_COMPANIES[ticker.trim().toUpperCase()] || null;
}
