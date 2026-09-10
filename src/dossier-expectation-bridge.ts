import type { ResearchDossier, DossierClaim, DossierQuarterPerformance } from "./dossier.ts";
import type { DeliveryMetric, ExpectationDeliveryInput, GateResult, QualityGateObservation } from "./expectation-delivery.ts";

export type DossierExpectationBridgeContext = {
  lifecycle: string;
  lifecycleFreezeDate: string;
  expectationFreezeDate: string;
  sectorValuationPercentile?: number | null;
};

const gateDefinitions: Array<[string, string, "hard" | "soft"]> = [
  ["cash_conversion", "Cash conversion", "hard"],
  ["leverage_coverage", "Leverage and coverage", "hard"],
  ["promoter_pledge", "Promoter pledge", "hard"],
  ["auditor_integrity", "Auditor integrity", "hard"],
  ["material_governance", "Material governance", "hard"],
  ["working_capital", "Working-capital discipline", "soft"],
  ["concentration", "Customer or product concentration", "soft"],
  ["incremental_roce", "Incremental return on capital", "soft"],
  ["acquisition_dependence", "Acquisition dependence", "soft"],
  ["management_delivery_history", "Management delivery history", "soft"],
];

const explicitGateRules: Partial<Record<string, { pass: RegExp; fail: RegExp }>> = {
  cash_conversion: {
    pass: /\b(?:cash conversion|operating cash flow).{0,50}\b(?:improved|strong|positive)\b/i,
    fail: /\b(?:cash conversion|operating cash flow).{0,50}\b(?:deteriorated|weak|negative)\b/i,
  },
  leverage_coverage: {
    pass: /\b(?:debt[- ]free|net cash|zero net debt)\b/i,
    fail: /\b(?:debt service default|defaulted on debt|negative interest coverage)\b/i,
  },
  promoter_pledge: {
    pass: /\b(?:no|nil|zero)\s+(?:promoter\s+)?(?:share\s+)?pledge\b|\b(?:promoter\s+)?pledge.{0,20}\b0(?:\.0+)?%/i,
    fail: /\bpromoter.{0,30}pledge(?:d|s|ing)?.{0,25}\b(?:[1-9]\d*(?:\.\d+)?)%/i,
  },
  auditor_integrity: {
    pass: /\b(?:unmodified|unqualified)\s+(?:audit(?:or'?s)?\s+)?opinion\b/i,
    fail: /\b(?:qualified|adverse)\s+(?:audit(?:or'?s)?\s+)?opinion\b|\bauditor resignation\b|\bdisclaimer of opinion\b/i,
  },
  material_governance: {
    pass: /\bno material (?:governance|regulatory) (?:issue|concern|action)s?\b/i,
    fail: /\b(?:material fraud|regulatory action|SEBI (?:action|penalty|investigation)|governance failure)\b/i,
  },
};

function supportedClaims(dossier: ResearchDossier): DossierClaim[] {
  return Object.values(dossier.sections).flat().filter(claim => claim.status === "supported");
}

function gateObservation(definition: [string, string, "hard" | "soft"], claims: DossierClaim[]): QualityGateObservation {
  const [id, label, severity] = definition;
  const rules = explicitGateRules[id];
  if (!rules) return { id, label, severity, result: "unknown", explanation: null, evidenceRefs: [] };
  const fail = claims.find(claim => rules.fail.test(claim.text));
  const pass = claims.find(claim => rules.pass.test(claim.text));
  const selected = fail || pass;
  const result: GateResult = fail ? "fail" : pass ? "pass" : "unknown";
  return {
    id, label, severity, result,
    explanation: selected?.text || null,
    evidenceRefs: selected ? [...new Set(selected.sourceIds)] : [],
  };
}

function fiscalQuarterKey(period: string): number | null {
  const match = period.match(/\bQ([1-4])\b[\s_-]*(?:FY|FISCAL YEAR)?[\s_-]*(20\d{2}|\d{2})\b/i);
  if (!match) return null;
  const year = Number(match[2].length === 2 ? `20${match[2]}` : match[2]);
  return year * 4 + Number(match[1]);
}

function orderedComparableQuarters(rows: DossierQuarterPerformance[]): DossierQuarterPerformance[] {
  const keyed = rows.map(row => ({ row, key: fiscalQuarterKey(row.period) })).filter(item => item.key !== null);
  if (!keyed.length) return [];
  keyed.sort((a, b) => (a.key as number) - (b.key as number));
  const latestBasis = keyed.at(-1)!.row.basis;
  const basis = latestBasis === "unknown" ? null : latestBasis;
  const deduplicated = new Map<number, DossierQuarterPerformance>();
  keyed.filter(item => !basis || item.row.basis === basis).forEach(item => deduplicated.set(item.key as number, item.row));
  return [...deduplicated.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}

const changePct = (current: number, prior: number) => prior === 0 ? null : ((current - prior) / Math.abs(prior)) * 100;
const rounded = (value: number | null) => value === null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;

function metric(
  id: string, label: string, unit: string, tolerance: number, weight: number,
  expected: number | null, actual: number | null, sourceIds: string[],
): DeliveryMetric {
  return {
    id, label, unit, tolerance, weight, expected: rounded(expected), actual: rounded(actual), higherIsBetter: true,
    expectationSource: "internal_baseline", evidenceRefs: [...new Set(sourceIds)],
  };
}

export function buildExpectationDeliveryInputFromDossier(
  dossier: ResearchDossier,
  context: DossierExpectationBridgeContext,
): ExpectationDeliveryInput {
  const claims = supportedClaims(dossier);
  const quarters = orderedComparableQuarters(dossier.quarterlyPerformance || []);
  const latest = quarters.at(-1);
  const prior = quarters.at(-2);
  const currentYearAgo = quarters.at(-5);
  const priorYearAgo = quarters.at(-6);

  const currentRevenueGrowth = latest?.revenueCr != null && currentYearAgo?.revenueCr != null
    ? changePct(latest.revenueCr, currentYearAgo.revenueCr) : null;
  const priorRevenueGrowth = prior?.revenueCr != null && priorYearAgo?.revenueCr != null
    ? changePct(prior.revenueCr, priorYearAgo.revenueCr) : null;
  const revenueRefs = [latest, currentYearAgo, prior, priorYearAgo].flatMap(row => row?.sourceIds || []);
  const marginRefs = [latest, prior].flatMap(row => row?.sourceIds || []);

  return {
    symbol: dossier.company.symbol,
    companyName: dossier.company.name,
    lifecycle: context.lifecycle,
    lifecycleFreezeDate: context.lifecycleFreezeDate,
    assessmentMode: "reconstructed_today",
    expectationFreezeDate: context.expectationFreezeDate,
    outcomeDate: dossier.generatedAt.slice(0, 10),
    sectorValuationPercentile: context.sectorValuationPercentile ?? null,
    qualityGates: gateDefinitions.map(definition => gateObservation(definition, claims)),
    deliveryMetrics: [
      metric("revenue_growth", "Revenue growth versus prior YoY baseline", "%", 3, 30, priorRevenueGrowth, currentRevenueGrowth, revenueRefs),
      metric("operating_margin", "EBITDA margin versus prior-quarter baseline", "%", 2, 30,
        prior?.ebitdaMarginPct ?? null, latest?.ebitdaMarginPct ?? null, marginRefs),
      metric("cash_conversion", "Operating cash conversion", "%", 10, 20, null, null, []),
      metric("management_target_delivery", "Management target delivery", "%", 10, 20, null, null, []),
    ],
    evidence: dossier.sources.filter(source => source.publishedAt).map(source => ({
      id: source.sourceId, url: source.url, publishedAt: source.publishedAt as string,
      label: source.sourceClass,
    })),
  };
}
