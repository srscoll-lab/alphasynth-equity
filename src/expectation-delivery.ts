export const EXPECTATION_DELIVERY_SCHEMA_VERSION = "1.0.0" as const;

export type AssessmentMode = "prospective" | "reconstructed_today";
export type GateSeverity = "hard" | "soft";
export type GateResult = "pass" | "fail" | "unknown";
export type QualityStatus = "pass" | "watch" | "fail" | "insufficient_evidence";
export type ExpectationLevel = "low" | "balanced" | "high" | "unknown";
export type DeliveryDirection = "ahead" | "in_line" | "behind" | "unknown";
export type GapClassification =
  | "under_recognised_delivery"
  | "expectations_confirmed"
  | "turnaround_unconfirmed"
  | "derating_risk"
  | "delivery_ahead"
  | "balanced"
  | "delivery_behind"
  | "not_eligible"
  | "insufficient_evidence";

export type EvidenceReference = {
  id: string;
  url: string;
  publishedAt: string;
  label?: string | null;
};

export type QualityGateObservation = {
  id: string;
  label: string;
  severity: GateSeverity;
  result: GateResult;
  explanation: string | null;
  evidenceRefs: string[];
};

export type DeliveryMetric = {
  id: string;
  label: string;
  expected: number | null;
  actual: number | null;
  unit: string;
  tolerance: number;
  higherIsBetter: boolean;
  weight: number;
  expectationSource: "management_guidance" | "market_implied" | "analyst_consensus" | "internal_baseline";
  evidenceRefs: string[];
};

export type ExpectationDeliveryInput = {
  symbol: string;
  companyName: string;
  lifecycle: string;
  lifecycleFreezeDate: string;
  assessmentMode: AssessmentMode;
  expectationFreezeDate: string;
  outcomeDate: string | null;
  sectorValuationPercentile: number | null;
  qualityGates: QualityGateObservation[];
  deliveryMetrics: DeliveryMetric[];
  evidence: EvidenceReference[];
};

export type ExpectationDeliveryAssessment = {
  schemaVersion: typeof EXPECTATION_DELIVERY_SCHEMA_VERSION;
  symbol: string;
  companyName: string;
  lifecycle: string;
  lifecycleUnchanged: true;
  assessmentMode: AssessmentMode;
  qualityStatus: QualityStatus;
  expectationLevel: ExpectationLevel;
  deliveryDirection: DeliveryDirection;
  deliveryScore: number | null;
  deliveryCoverage: number;
  gapClassification: GapClassification;
  hardGateFailures: string[];
  softWarnings: string[];
  explanation: string;
};

export function expectationDeliveryInputErrors(value: unknown): string[] {
  if (!value || typeof value !== "object") return ["Request body must be an object."];
  const input = value as Partial<ExpectationDeliveryInput>;
  const errors: string[] = [];
  if (typeof input.symbol !== "string" || !/^[A-Z0-9&.-]{1,24}$/.test(input.symbol.trim().toUpperCase())) errors.push("A valid symbol is required.");
  if (typeof input.companyName !== "string" || !input.companyName.trim()) errors.push("companyName is required.");
  if (typeof input.lifecycle !== "string" || !input.lifecycle.trim()) errors.push("lifecycle is required.");
  if (!['prospective', 'reconstructed_today'].includes(String(input.assessmentMode))) errors.push("assessmentMode must be prospective or reconstructed_today.");
  if (typeof input.expectationFreezeDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.expectationFreezeDate)) errors.push("expectationFreezeDate must be YYYY-MM-DD.");
  if (!Array.isArray(input.qualityGates)) errors.push("qualityGates must be an array.");
  if (!Array.isArray(input.deliveryMetrics)) errors.push("deliveryMetrics must be an array.");
  if (!Array.isArray(input.evidence)) errors.push("evidence must be an array.");
  if (input.sectorValuationPercentile !== null && (typeof input.sectorValuationPercentile !== "number" || input.sectorValuationPercentile < 0 || input.sectorValuationPercentile > 100)) {
    errors.push("sectorValuationPercentile must be null or a number from 0 to 100.");
  }
  if (Array.isArray(input.deliveryMetrics)) {
    input.deliveryMetrics.forEach((metric, index) => {
      if (!metric || typeof metric !== "object") return errors.push(`deliveryMetrics[${index}] must be an object.`);
      if (typeof metric.weight !== "number" || metric.weight <= 0) errors.push(`deliveryMetrics[${index}].weight must be positive.`);
      if (typeof metric.tolerance !== "number" || metric.tolerance <= 0) errors.push(`deliveryMetrics[${index}].tolerance must be positive.`);
    });
  }
  return errors;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function evaluateQuality(gates: QualityGateObservation[]) {
  const hard = gates.filter(gate => gate.severity === "hard");
  const hardGateFailures = hard.filter(gate => gate.result === "fail").map(gate => gate.label);
  const softWarnings = gates.filter(gate => gate.severity === "soft" && gate.result === "fail").map(gate => gate.label);
  const hardUnknown = hard.some(gate => gate.result === "unknown");
  const qualityStatus: QualityStatus = hardGateFailures.length
    ? "fail"
    : !hard.length || hardUnknown
      ? "insufficient_evidence"
      : softWarnings.length
        ? "watch"
        : "pass";
  return { qualityStatus, hardGateFailures, softWarnings };
}

function evaluateDelivery(metrics: DeliveryMetric[]) {
  const totalConfiguredWeight = metrics.reduce((sum, metric) => sum + Math.max(0, metric.weight), 0);
  const available = metrics.filter(metric => metric.expected !== null && metric.actual !== null && metric.tolerance > 0 && metric.weight > 0);
  const availableWeight = available.reduce((sum, metric) => sum + metric.weight, 0);
  const deliveryCoverage = totalConfiguredWeight > 0 ? availableWeight / totalConfiguredWeight : 0;
  if (!available.length || deliveryCoverage < 0.6) {
    return { deliveryScore: null, deliveryCoverage, deliveryDirection: "unknown" as const };
  }
  const weighted = available.reduce((sum, metric) => {
    const rawDifference = (metric.actual as number) - (metric.expected as number);
    const directionalDifference = metric.higherIsBetter ? rawDifference : -rawDifference;
    const normalized = clamp(directionalDifference / metric.tolerance, -1, 1);
    return sum + normalized * metric.weight;
  }, 0);
  const deliveryScore = Math.round((weighted / availableWeight) * 1000) / 10;
  const deliveryDirection: DeliveryDirection = deliveryScore >= 10 ? "ahead" : deliveryScore <= -10 ? "behind" : "in_line";
  return { deliveryScore, deliveryCoverage, deliveryDirection };
}

function expectationLevel(percentile: number | null): ExpectationLevel {
  if (percentile === null || !Number.isFinite(percentile)) return "unknown";
  if (percentile <= 35) return "low";
  if (percentile >= 65) return "high";
  return "balanced";
}

function classifyGap(quality: QualityStatus, expectation: ExpectationLevel, delivery: DeliveryDirection): GapClassification {
  if (quality === "fail") return "not_eligible";
  if (quality === "insufficient_evidence" || expectation === "unknown" || delivery === "unknown") return "insufficient_evidence";
  if (expectation === "low" && delivery === "ahead") return "under_recognised_delivery";
  if (expectation === "high" && delivery === "ahead") return "expectations_confirmed";
  if (expectation === "low" && delivery === "behind") return "turnaround_unconfirmed";
  if (expectation === "high" && delivery === "behind") return "derating_risk";
  if (delivery === "ahead") return "delivery_ahead";
  if (delivery === "behind") return "delivery_behind";
  return "balanced";
}

const readable = (value: string) => value.replaceAll("_", " ");

export function assessExpectationDelivery(input: ExpectationDeliveryInput): ExpectationDeliveryAssessment {
  const quality = evaluateQuality(input.qualityGates);
  const delivery = evaluateDelivery(input.deliveryMetrics);
  const expectation = expectationLevel(input.sectorValuationPercentile);
  const gapClassification = classifyGap(quality.qualityStatus, expectation, delivery.deliveryDirection);
  const explanation = gapClassification === "insufficient_evidence"
    ? "The available evidence does not yet support a complete expectations–delivery classification. Missing observations remain unknown."
    : gapClassification === "not_eligible"
      ? `The company is excluded from the refined research shortlist because it failed ${quality.hardGateFailures.length} hard quality gate${quality.hardGateFailures.length === 1 ? "" : "s"}. Its frozen lifecycle classification is unchanged.`
      : `The frozen ${input.lifecycle} lifecycle remains unchanged. Quality is ${readable(quality.qualityStatus)}, market expectations are ${readable(expectation)}, and measured delivery is ${readable(delivery.deliveryDirection)}.`;
  return {
    schemaVersion: EXPECTATION_DELIVERY_SCHEMA_VERSION,
    symbol: input.symbol,
    companyName: input.companyName,
    lifecycle: input.lifecycle,
    lifecycleUnchanged: true,
    assessmentMode: input.assessmentMode,
    qualityStatus: quality.qualityStatus,
    expectationLevel: expectation,
    deliveryDirection: delivery.deliveryDirection,
    deliveryScore: delivery.deliveryScore,
    deliveryCoverage: Math.round(delivery.deliveryCoverage * 100),
    gapClassification,
    hardGateFailures: quality.hardGateFailures,
    softWarnings: quality.softWarnings,
    explanation,
  };
}

export const EXPECTATION_DELIVERY_RULES = {
  lifecyclePolicy: "The overlay never changes the frozen BMS score or lifecycle classification.",
  qualityPolicy: "Any failed hard gate excludes a company from the refined shortlist; unknown hard gates produce insufficient evidence.",
  evidencePolicy: "Missing values remain unknown and are never converted to zero or estimated by a language model.",
  historyPolicy: "Reconstructed history must be labelled reconstructed_today and cannot be represented as a prospectively frozen signal.",
  deliveryPolicy: "A delivery classification requires at least 60 percent of configured metric weight to have comparable expected and actual values.",
  valuationPolicy: "Expectation level uses a sector-appropriate valuation percentile, not a universal P/E threshold.",
} as const;
