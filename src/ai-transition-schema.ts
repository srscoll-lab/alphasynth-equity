export const AI_TRANSITION_SCHEMA_VERSION = "0.1.0" as const;

export const AI_EXPOSURE_DIMENSIONS = [
  { id: "task_automability", label: "Task automability", weight: 0.25 },
  { id: "effort_billing_dependence", label: "Effort-billing dependence", weight: 0.20 },
  { id: "pricing_deflation", label: "Pricing-deflation evidence", weight: 0.20 },
  { id: "insourcing_risk", label: "Client insourcing risk", weight: 0.15 },
  { id: "concentration_risk", label: "Client / vertical / geography concentration", weight: 0.20 },
] as const;

export const AI_READINESS_DIMENSIONS = [
  { id: "ai_revenue_evidence", label: "Disclosed AI-linked revenue", weight: 0.25 },
  { id: "outcome_platform_migration", label: "Outcome / platform migration", weight: 0.20 },
  { id: "domain_moat", label: "Domain, certification and integration moat", weight: 0.20 },
  { id: "productivity_conversion", label: "Productivity converted into economics", weight: 0.15 },
  { id: "management_delivery", label: "Delivery against dated AI commitments", weight: 0.20 },
] as const;

export type AiTransitionEvidence = {
  evidenceId: string;
  sourceType: "exchange_filing" | "results" | "earnings_transcript" | "investor_presentation" | "annual_report";
  publishedAt: string;
  url: string;
  excerpt?: string | null;
};

export type AiTransitionDimension = {
  id: string;
  score: number | null;
  explanation: string | null;
  evidenceIds: string[];
};

export type AiTransitionOperatingMetrics = {
  currency: "INR";
  unit: "crore";
  revenue: number | null;
  revenueUsdBn: number | null;
  operatingMarginPct: number | null;
  employees: number | null;
  aiAnnualizedRevenueUsdBn: number | null;
  aiSkilledEmployees: number | null;
  totalIncome: number | null;
  licenseRevenue: number | null;
  platformRevenue: number | null;
  amcRevenue: number | null;
  licenseLinkedRevenue: number | null;
  ebitda: number | null;
  ebitdaMarginPct: number | null;
  pat: number | null;
  dealWins: number | null;
  digitalTransformations: number | null;
  aiRevenue: number | null;
  notes: string[];
};

export type AiTransitionAssessment = {
  schemaVersion: typeof AI_TRANSITION_SCHEMA_VERSION;
  symbol: string;
  companyName: string;
  businessModel: "it_services" | "engineering_rd" | "vertical_software" | "product_saas" | "bpm" | "mixed";
  assessmentAsOf: string;
  assessmentMode: "point_in_time" | "reconstructed_today";
  reconstructedAt: string | null;
  exposure: {
    score: number | null;
    coverage: number;
    dimensions: AiTransitionDimension[];
  };
  readiness: {
    score: number | null;
    coverage: number;
    dimensions: AiTransitionDimension[];
  };
  classification: "resilient" | "credible_transition" | "business_model_risk" | "low_exposure_unproven" | "insufficient_evidence";
  operatingMetrics: AiTransitionOperatingMetrics | null;
  evidence: AiTransitionEvidence[];
  eligibleForBacktest: boolean;
};

const boundedScore = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
};

function scoreSide(
  definitions: ReadonlyArray<{ id: string; label: string; weight: number }>,
  supplied: unknown,
) {
  const records = Array.isArray(supplied) ? supplied : [];
  const dimensions = definitions.map((definition) => {
    const record: any = records.find((item: any) => item?.id === definition.id) || {};
    return {
      id: definition.id,
      score: boundedScore(record.score),
      explanation: typeof record.explanation === "string" && record.explanation.trim() ? record.explanation.trim() : null,
      evidenceIds: Array.isArray(record.evidenceIds) ? [...new Set(record.evidenceIds.filter((id: unknown) => typeof id === "string" && id))] as string[] : [],
    };
  });
  const coverage = definitions.reduce((sum, definition, index) =>
    sum + (dimensions[index].score === null ? 0 : definition.weight), 0);
  const weighted = definitions.reduce((sum, definition, index) =>
    sum + (dimensions[index].score === null ? 0 : Number(dimensions[index].score) * definition.weight), 0);
  return {
    score: coverage < 0.6 ? null : Math.round(weighted / coverage * 10) / 10,
    coverage: Math.round(coverage * 1000) / 1000,
    dimensions,
  };
}

export function normalizeAiTransitionAssessment(input: any): AiTransitionAssessment {
  const exposure = scoreSide(AI_EXPOSURE_DIMENSIONS, input?.exposure?.dimensions);
  const readiness = scoreSide(AI_READINESS_DIMENSIONS, input?.readiness?.dimensions);
  const adequate = exposure.score !== null && readiness.score !== null;
  const classification = !adequate
    ? "insufficient_evidence"
    : exposure.score >= 60 && readiness.score >= 60
      ? "credible_transition"
      : exposure.score >= 60
        ? "business_model_risk"
        : readiness.score >= 60 ? "resilient" : "low_exposure_unproven";
  const assessmentMode = input?.assessmentMode === "point_in_time" ? "point_in_time" : "reconstructed_today";
  const evidence = Array.isArray(input?.evidence) ? input.evidence : [];
  const assessmentAsOf = String(input?.assessmentAsOf || "");
  const hasFutureSource = evidence.some((item: any) => String(item?.publishedAt || "") > assessmentAsOf);
  const metric = (value: unknown) => value === null || value === undefined || value === ""
    ? null
    : Number.isFinite(Number(value)) ? Number(value) : null;
  const suppliedMetrics = input?.operatingMetrics;
  const operatingMetrics = suppliedMetrics ? {
    currency: "INR" as const,
    unit: "crore" as const,
    revenue: metric(suppliedMetrics.revenue),
    revenueUsdBn: metric(suppliedMetrics.revenueUsdBn),
    operatingMarginPct: metric(suppliedMetrics.operatingMarginPct),
    employees: metric(suppliedMetrics.employees),
    aiAnnualizedRevenueUsdBn: metric(suppliedMetrics.aiAnnualizedRevenueUsdBn),
    aiSkilledEmployees: metric(suppliedMetrics.aiSkilledEmployees),
    totalIncome: metric(suppliedMetrics.totalIncome),
    licenseRevenue: metric(suppliedMetrics.licenseRevenue),
    platformRevenue: metric(suppliedMetrics.platformRevenue),
    amcRevenue: metric(suppliedMetrics.amcRevenue),
    licenseLinkedRevenue: metric(suppliedMetrics.licenseLinkedRevenue),
    ebitda: metric(suppliedMetrics.ebitda),
    ebitdaMarginPct: metric(suppliedMetrics.ebitdaMarginPct),
    pat: metric(suppliedMetrics.pat),
    dealWins: metric(suppliedMetrics.dealWins),
    digitalTransformations: metric(suppliedMetrics.digitalTransformations),
    aiRevenue: metric(suppliedMetrics.aiRevenue),
    notes: Array.isArray(suppliedMetrics.notes)
      ? suppliedMetrics.notes.filter((note: unknown) => typeof note === "string" && note.trim())
      : [],
  } : null;

  return {
    schemaVersion: AI_TRANSITION_SCHEMA_VERSION,
    symbol: String(input?.symbol || "").trim().toUpperCase(),
    companyName: String(input?.companyName || "").trim(),
    businessModel: input?.businessModel || "mixed",
    assessmentAsOf,
    assessmentMode,
    reconstructedAt: assessmentMode === "reconstructed_today" ? String(input?.reconstructedAt || new Date().toISOString()) : null,
    exposure,
    readiness,
    classification,
    operatingMetrics,
    evidence,
    eligibleForBacktest: assessmentMode === "point_in_time" && adequate && !hasFutureSource,
  };
}
