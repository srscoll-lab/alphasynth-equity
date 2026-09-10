import fs from "fs/promises";
import path from "path";
import { renderDossierPdf, type DossierPdfPayload } from "../src/dossier-pdf";
import { normalizeBmsFactorAnalysis } from "../src/bms-factor-schema";

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
        { sourceName: "MarketSmith India", sourceType: "publication", publishedAt: "7 July 2026", stance: "mixed", summary: "The investment newsletter describes simultaneous momentum in premium volumes, luxury growth and deleveraging, but notes that the elevated valuation requires sustained execution.", url: "https://marketsmithin.substack.com/p/radico-khaitan-the-compounding-thesis" },
        { sourceName: "Business Standard / Jefferies", sourceType: "analyst", publishedAt: "29 June 2026", stance: "positive", summary: "Reported analyst commentary highlights a long premiumisation runway and strong brand execution, while acknowledging that the shares command a premium valuation.", url: "https://www.business-standard.com/markets/news/jefferies-sees-premium-tailwind-intact-in-alcobev-prefers-radico-abdl-126062900329_1.html" },
        { sourceName: "ValuePickr forum", sourceType: "investor_forum", publishedAt: "12 May 2026", stance: "positive", summary: "A forum contributor focused on management's margin-expansion guidance and improving regional market share, reflecting optimism that still requires verification against official filings.", url: "https://forum.valuepickr.com/t/radico-khaitan-alcoholic-child/3062?page=7" },
        { sourceName: "Reddit / IndiaStockMarket", sourceType: "social_media", publishedAt: "4 September 2026", stance: "cautious", summary: "A retail discussion characterised the prior share-price run as strong but urged investors to reassess risk-reward and avoid chasing momentum or concentrating exposure.", url: "https://www.reddit.com/r/indiaStockMarket/comments/1w6y0lh/thoughts_on_this_stock/" },
      ],
    },
    shareholdingAsOf: "30 June 2026",
    shareholding: { promoter: { value: 40.25 }, fii: { value: 18.1 }, dii: { value: 9.8 }, mutualFund: { value: 7.4 }, retail: { value: 24.45 } },
  },
  market: {
    price: 2669.6, asOf: "2026-09-07", delayed: true,
    priceHistory: Array.from({ length: 52 }, (_, index) => ({ date: new Date(Date.UTC(2025, 8, 8 + index * 7)).toISOString().slice(0, 10), close: 1840 + index * 19 + Math.sin(index / 3) * 145 })),
  },
  bms: { score: 84, stage: "ESTABLISHED", period: "Q1 FY2027", factorAnalysis: normalizeBmsFactorAnalysis({
    period: "Q1 FY2027",
    factor_analysis: { factors: [
      { id: "earnings", previous: { period: "Q1 FY2026", factor_score: 0.67, metrics: [{ key: "revenue", label: "Revenue", value: 1425.4, unit: "Rs.Cr" }, { key: "pat", label: "PAT", value: 77.4, unit: "Rs.Cr" }] }, current: { period: "Q1 FY2027", factor_score: 0.87, metrics: [{ key: "revenue", label: "Revenue", value: 1683.7, unit: "Rs.Cr", displayValue: "+18.1% YoY" }, { key: "pat", label: "PAT", value: 98.6, unit: "Rs.Cr", displayValue: "+27.4% YoY" }] }, explanation: "Earnings momentum strengthened.", evidence_refs: ["official-001"], confidence: "high" },
      { id: "economics", previous: { period: "Q1 FY2026", factor_score: 0.70, metrics: [{ key: "gross_margin", label: "Gross margin", value: 43.8, unit: "%" }] }, current: { period: "Q1 FY2027", factor_score: 0.76, metrics: [{ key: "gross_margin", label: "Gross margin", value: 49.1, unit: "%", displayValue: "49.1% despite input-cost pressure" }] }, explanation: "Industry and product-mix economics improved modestly.", evidence_refs: ["official-001"], confidence: "medium" },
      { id: "execution", previous: { period: "Q1 FY2026", factor_score: 0.69, metrics: [{ key: "premium_volume", label: "Prestige & Above volume growth", value: 18.4, unit: "%" }] }, current: { period: "Q1 FY2027", factor_score: 0.81, metrics: [{ key: "premium_volume", label: "Prestige & Above volume growth", value: 35.8, unit: "%", displayValue: "+35.8% YoY" }] }, explanation: "Premium portfolio execution broadened.", evidence_refs: ["official-001"], confidence: "high" },
      { id: "balance_sheet", previous: { period: "Q1 FY2026", factor_score: 0.62, metrics: [{ key: "net_debt", label: "Net debt", value: 244, unit: "Rs.Cr" }] }, current: { period: "Q1 FY2027", factor_score: 0.72, metrics: [{ key: "net_debt", label: "Net debt", value: 106, unit: "Rs.Cr", displayValue: "Rs.106 Cr; down Rs.138 Cr" }] }, explanation: "Net debt declined and financial flexibility improved.", evidence_refs: ["official-002"], confidence: "high" },
      { id: "management_delivery", previous: { period: "Q1 FY2026", factor_score: 0.71, metrics: [{ key: "premiumisation_priority", label: "Premiumisation priority", value: "Stated strategy" }] }, current: { period: "Q1 FY2027", factor_score: 0.79, metrics: [{ key: "premiumisation_delivery", label: "Premium portfolio", value: 53.1, unit: "%", displayValue: "53.1% of own volume" }] }, explanation: "Reported delivery remained aligned with stated premiumisation priorities.", evidence_refs: ["official-003"], confidence: "medium" },
    ] },
  }), components: [
    { label: "Earnings", score: 87 }, { label: "Economics", score: 76 }, { label: "Execution", score: 81 }, { label: "Balance sheet", score: 72 }, { label: "Management", score: 79 },
  ] },
  deliveryCheck: {
    input: {
      symbol: "RADICO", companyName: "Radico Khaitan Limited", lifecycle: "ESTABLISHED",
      lifecycleFreezeDate: "2026-08-25", assessmentMode: "reconstructed_today",
      expectationFreezeDate: "2026-09-08", outcomeDate: "2026-06-30",
      sectorValuationPercentile: null,
      qualityGates: [
        { id: "cash_conversion", label: "Cash conversion", severity: "hard", result: "unknown", explanation: null, evidenceRefs: [] },
        { id: "leverage_coverage", label: "Leverage and coverage", severity: "hard", result: "pass", explanation: "Net debt declined during the period.", evidenceRefs: ["official-002"] },
        { id: "promoter_pledge", label: "Promoter pledge", severity: "hard", result: "unknown", explanation: null, evidenceRefs: [] },
        { id: "auditor_integrity", label: "Auditor integrity", severity: "hard", result: "unknown", explanation: null, evidenceRefs: [] },
        { id: "management_delivery_history", label: "Management delivery history", severity: "soft", result: "unknown", explanation: null, evidenceRefs: [] },
      ],
      deliveryMetrics: [], evidence: [],
    },
    assessment: {
      schemaVersion: "1.1.0", symbol: "RADICO", companyName: "Radico Khaitan Limited",
      lifecycle: "ESTABLISHED", lifecycleUnchanged: true, assessmentMode: "reconstructed_today",
      qualityStatus: "insufficient_evidence", expectationLevel: "unknown", deliveryDirection: "ahead",
      deliveryScore: 50, deliveryCoverage: 60, gapClassification: "insufficient_evidence",
      hardGateFailures: [], softWarnings: [],
      explanation: "Published quarterly history indicates improving delivery, while the BMS V1 lifecycle recorded as of the stated date remains unchanged.",
      deliveryComponents: [
        { id: "revenue_growth", label: "Revenue growth versus prior YoY baseline", baselineLabel: "Previous reading", outcomeLabel: "Current reading", baseline: 12.5, outcome: 18.1, change: 5.6, unit: "%", direction: "positive" },
        { id: "operating_margin", label: "EBITDA margin versus prior-quarter baseline", baselineLabel: "Previous reading", outcomeLabel: "Current reading", baseline: 19.3, outcome: 20.7, change: 1.4, unit: "%", direction: "positive" },
      ],
    },
  },
};

const output = path.resolve("output/pdf/AlphaSynth-Professional-Dossier-Sample.pdf");
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, await renderDossierPdf(payload));
console.log(output);
