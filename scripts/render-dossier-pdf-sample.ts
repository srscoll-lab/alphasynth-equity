import fs from "fs/promises";
import path from "path";
import { renderDossierPdf, type DossierPdfPayload } from "../src/dossier-pdf";

const sourceIds = ["official-001", "official-002", "official-003"];
const claim = (claimId: string, text: string, sourceId = "official-001") => ({ claimId, text, sourceIds: [sourceId], status: "supported" as const });

const payload: DossierPdfPayload = {
  dossier: {
    schemaVersion: "1.0.0",
    reportId: "RADICO-LAYOUT-SAMPLE",
    generatedAt: "2026-09-08T10:00:00.000Z",
    company: { symbol: "RADICO", name: "Radico Khaitan Limited", exchange: "NSE_BSE", sector: "Alcoholic Beverages", officialDomains: ["radicokhaitan.com"] },
    sections: {
      snapshot: [
        claim("claim-001", "Radico Khaitan is an Indian branded alcoholic-beverages company with a portfolio spanning whisky, vodka, rum and brandy."),
        claim("claim-002", "The company operates Rampur Distillery and reports a growing contribution from Prestige & Above brands."),
        claim("claim-003", "Revenue from operations increased year on year in the latest admitted quarter.", "official-002"),
      ],
      developments: [
        claim("claim-004", "The company launched new premium products across whisky, vodka and rum categories."),
        claim("claim-005", "Prestige & Above volume growth continued to outpace total portfolio volume growth."),
        claim("claim-006", "The board approved the latest unaudited standalone and consolidated financial results.", "official-002"),
      ],
      operatingEvidence: [
        claim("claim-007", "Premiumisation supported expansion in gross margin despite a difficult raw-material environment."),
        claim("claim-008", "Net debt declined during the period, strengthening the balance-sheet position.", "official-002"),
        claim("claim-009", "Management reported stable market share in its core vodka category.", "official-003"),
      ],
      managementCommitments: [
        claim("claim-010", "Management remains focused on organic growth and disciplined capital allocation.", "official-003"),
        claim("claim-011", "Capacity investments are intended to support the medium-term premium portfolio strategy.", "official-003"),
      ],
      risks: [
        claim("claim-012", "Raw-material inflation and state-level regulatory changes remain important variables."),
        claim("claim-013", "Premium demand, competitive intensity and execution of new launches require monitoring."),
      ],
    },
    quarterlyPerformance: [
      { period: "Q1 FY2027", basis: "consolidated", revenueCr: 1683.7, ebitdaCr: 348.1, ebitdaMarginPct: 20.7, patCr: 214.5, eps: 16.02, sourceIds: ["official-001"] },
      { period: "Q4 FY2026", basis: "consolidated", revenueCr: 1518.2, ebitdaCr: 292.4, ebitdaMarginPct: 19.3, patCr: 176.9, eps: 13.22, sourceIds: ["official-002"] },
      { period: "Q3 FY2026", basis: "consolidated", revenueCr: 1487.6, ebitdaCr: 278.8, ebitdaMarginPct: 18.7, patCr: 165.3, eps: 12.35, sourceIds: ["official-003"] },
      { period: "Q2 FY2026", basis: "consolidated", revenueCr: 1394.1, ebitdaCr: 251.2, ebitdaMarginPct: 18.0, patCr: 148.4, eps: 11.09, sourceIds: ["official-003"] },
    ],
    sources: sourceIds.map((sourceId, index) => ({ sourceId, url: `https://radicokhaitan.com/investor-relations/document-${index + 1}.pdf`, sourceClass: "company_official", publishedAt: `2026-0${7 + Math.min(index, 1)}-${28 - index}`, retrievedAt: "2026-09-08T09:00:00.000Z" })),
    marketConversation: { status: "available", affectsBms: false, sampleSize: 42, sentiment: { positive: 0.52, neutral: 0.31, negative: 0.17 }, themes: [] },
    qualityControl: { unsupportedClaims: 0, conflicts: 0, humanReviewRequired: true },
  },
  peers: [
    { ticker: "RADICO", epsTtm: 54.2, pe: 48.1, pb: 9.4, roe: 20.1, roce: 24.7, debtEquity: 0.15, revenueGrowthYoY: 11.8, operatingMargin: 20.7, marketCapCr: 60212, week52Return: 61 },
    { ticker: "UNSP", epsTtm: 32.8, pe: 44.2, pb: 8.1, roe: 18.6, roce: 22.4, debtEquity: 0.08, revenueGrowthYoY: 7.7, operatingMargin: 18.9, marketCapCr: 104375, week52Return: 12.4 },
    { ticker: "TI", epsTtm: 9.7, pe: 69.0, pb: 4.53, roe: 9.1, roce: 11.6, revenueGrowthYoY: 15.4, operatingMargin: 9.3, marketCapCr: 13242, week52Return: 16.5 },
    { ticker: "GLOBUSSPR", epsTtm: 33.03, pe: 28.6, pb: 2.2, roe: 9.1, roce: 11.6, debtEquity: 0.5, revenueGrowthYoY: 13, operatingMargin: 9.8, marketCapCr: 2877, week52Return: -15.8 },
    { ticker: "ABDL", epsTtm: 7.9, pe: 75.2, pb: 10.1, roe: 14.3, roce: 18.4, marketCapCr: 16783, week52Return: 17.6 },
  ],
  enrichment: {
    executiveSummary: {
      companyLine: "A premiumisation-led alcoholic beverages company with strengthening earnings momentum and improving balance-sheet flexibility.",
      companyHistory: "The business traces its roots to Rampur Distillery, established in 1943. It evolved from a bulk-spirits producer into a branded portfolio company and adopted the Radico Khaitan name in 1999. Its current strategy emphasises premium Indian spirits, brand-led growth and selective capacity expansion.",
      keyNumber: "20.7% EBITDA margin",
      biggestRisk: "Premium valuation leaves limited room for execution slippage.",
    },
    promoterNames: ["Lalit Khaitan", "Abhishek Khaitan", "Amar Sinha"],
    publicCommentary: {
      asOf: "7 September 2026",
      summary: "Recent public analysis broadly recognises the strength of premiumisation and deleveraging, while repeatedly questioning whether the valuation already discounts much of that improvement.",
      viewpoints: [
        { sourceName: "MarketSmith India", publishedAt: "7 July 2026", stance: "mixed", summary: "The investment newsletter describes simultaneous momentum in premium volumes, luxury growth and deleveraging, but notes that the elevated valuation requires sustained execution.", url: "https://marketsmithin.substack.com/p/radico-khaitan-the-compounding-thesis" },
        { sourceName: "Business Standard / Jefferies", publishedAt: "29 June 2026", stance: "positive", summary: "Reported analyst commentary highlights a long premiumisation runway and strong brand execution, while acknowledging that the shares command a premium valuation.", url: "https://www.business-standard.com/markets/news/jefferies-sees-premium-tailwind-intact-in-alcobev-prefers-radico-abdl-126062900329_1.html" },
        { sourceName: "QuarterMark Research", publishedAt: "29 July 2026", stance: "cautious", summary: "The quarterly review credits premium mix for stronger growth and margins, but says new investment must still convert into repeat consumption and profitable scale.", url: "https://quartermark.in/companies/RADICO/earnings-calls/Q1-FY27/earnings" },
      ],
    },
    shareholdingAsOf: "30 June 2026",
    shareholding: { promoter: { value: 40.25 }, fii: { value: 18.1 }, dii: { value: 9.8 }, mutualFund: { value: 7.4 }, retail: { value: 24.45 } },
  },
  market: {
    price: 2669.6, asOf: "2026-09-07", delayed: true,
    priceHistory: Array.from({ length: 52 }, (_, index) => ({ date: new Date(Date.UTC(2025, 8, 8 + index * 7)).toISOString().slice(0, 10), close: 1840 + index * 19 + Math.sin(index / 3) * 145 })),
  },
  bms: { score: 84, stage: "ESTABLISHED", period: "Q1 FY2027", components: [
    { label: "Earnings", score: 87 }, { label: "Economics", score: 76 }, { label: "Execution", score: 81 }, { label: "Balance sheet", score: 72 }, { label: "Management", score: 79 },
  ] },
};

const output = path.resolve("output/pdf/AlphaSynth-Professional-Dossier-Sample.pdf");
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, await renderDossierPdf(payload));
console.log(output);
