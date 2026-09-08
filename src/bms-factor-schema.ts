export const BMS_FACTOR_SCHEMA_VERSION = "1.0.0" as const;
export const BMS_METHODOLOGY_VERSION = "BMS_V1" as const;

export const BMS_FACTOR_DEFINITIONS = [
  { id: "earnings", label: "Earnings", weight: 0.25 },
  { id: "economics", label: "Economics", weight: 0.25 },
  { id: "execution", label: "Execution", weight: 0.25 },
  { id: "balance_sheet", label: "Balance sheet", weight: 0.15 },
  { id: "management_delivery", label: "Management delivery", weight: 0.10 },
] as const;

export type BmsFactorId = typeof BMS_FACTOR_DEFINITIONS[number]["id"];
export type BmsFactorAvailability = "complete" | "partial" | "unavailable";
export type BmsFactorConfidence = "high" | "medium" | "low" | "unavailable";
export type BmsMetricValue = number | string | boolean | null;

export type BmsFactorMetric = {
  key: string;
  label: string;
  value: BmsMetricValue;
  unit?: string | null;
  displayValue?: string | null;
};

export type BmsFactorMeasurement = {
  period: string | null;
  observedAt: string | null;
  factorScore: number | null;
  metrics: BmsFactorMetric[];
};

export type BmsFactorComparison = {
  id: BmsFactorId;
  label: string;
  weight: number;
  previous: BmsFactorMeasurement;
  current: BmsFactorMeasurement;
  factorScoreChange: number | null;
  weightedScoreContribution: number | null;
  weightedChangeContribution: number | null;
  explanation: string | null;
  evidenceRefs: string[];
  availability: BmsFactorAvailability;
  confidence: BmsFactorConfidence;
};

export type BmsFactorAnalysis = {
  schemaVersion: typeof BMS_FACTOR_SCHEMA_VERSION;
  methodologyVersion: typeof BMS_METHODOLOGY_VERSION;
  comparisonBasis: "same-quarter-prior-year";
  generatedAt: string | null;
  factors: BmsFactorComparison[];
};

const finiteNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const stringOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const metricValue = (value: unknown): BmsMetricValue => {
  if (value === null || typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value as BmsMetricValue;
  }
  return null;
};

const normalizeMetrics = (value: unknown): BmsFactorMetric[] => Array.isArray(value)
  ? value.flatMap((item: any) => {
      const key = stringOrNull(item?.key);
      const label = stringOrNull(item?.label);
      if (!key || !label) return [];
      return [{
        key,
        label,
        value: metricValue(item?.value),
        unit: stringOrNull(item?.unit),
        displayValue: stringOrNull(item?.displayValue ?? item?.display_value),
      }];
    })
  : [];

const emptyMeasurement = (period: string | null = null): BmsFactorMeasurement => ({
  period,
  observedAt: null,
  factorScore: null,
  metrics: [],
});

const normalizeMeasurement = (value: any, fallbackPeriod: string | null, fallbackScore?: unknown): BmsFactorMeasurement => ({
  period: stringOrNull(value?.period) ?? fallbackPeriod,
  observedAt: stringOrNull(value?.observedAt ?? value?.observed_at),
  factorScore: finiteNumberOrNull(value?.factorScore ?? value?.factor_score ?? fallbackScore),
  metrics: normalizeMetrics(value?.metrics),
});

/**
 * Builds the report-facing factor contract without changing BMS V1.
 * Legacy lifecycle payloads receive their current factor scores, while all
 * unavailable historical measurements remain null rather than becoming zero.
 */
export function normalizeBmsFactorAnalysis(company: any): BmsFactorAnalysis {
  const supplied = company?.factor_analysis ?? company?.factorAnalysis;
  const suppliedFactors = Array.isArray(supplied?.factors) ? supplied.factors : [];
  const currentPeriod = stringOrNull(company?.period);

  const factors = BMS_FACTOR_DEFINITIONS.map((definition): BmsFactorComparison => {
    const raw = suppliedFactors.find((factor: any) => factor?.id === definition.id) || {};
    const current = normalizeMeasurement(raw.current, currentPeriod, company?.[definition.id]);
    const previous = raw.previous
      ? normalizeMeasurement(raw.previous, null)
      : emptyMeasurement();
    const explicitChange = finiteNumberOrNull(raw.factorScoreChange ?? raw.factor_score_change);
    const calculatedChange = current.factorScore !== null && previous.factorScore !== null
      ? current.factorScore - previous.factorScore
      : null;
    const factorScoreChange = explicitChange ?? calculatedChange;
    const explicitScoreContribution = finiteNumberOrNull(raw.weightedScoreContribution ?? raw.weighted_score_contribution);
    const weightedScoreContribution = explicitScoreContribution ?? (current.factorScore === null
      ? null
      : current.factorScore * definition.weight);
    const explicitChangeContribution = finiteNumberOrNull(raw.weightedChangeContribution ?? raw.weighted_change_contribution);
    const weightedChangeContribution = explicitChangeContribution ?? (factorScoreChange === null
      ? null
      : factorScoreChange * definition.weight);
    const hasPrevious = previous.factorScore !== null || previous.metrics.length > 0;
    const hasCurrent = current.factorScore !== null || current.metrics.length > 0;
    const availability: BmsFactorAvailability = hasPrevious && hasCurrent
      ? "complete"
      : hasPrevious || hasCurrent
        ? "partial"
        : "unavailable";
    const evidenceRefs = Array.isArray(raw.evidenceRefs ?? raw.evidence_refs)
      ? (raw.evidenceRefs ?? raw.evidence_refs).filter((item: unknown): item is string => typeof item === "string" && Boolean(item.trim()))
      : [];
    const confidence = ["high", "medium", "low", "unavailable"].includes(raw.confidence)
      ? raw.confidence as BmsFactorConfidence
      : availability === "unavailable" ? "unavailable" : "low";

    return {
      id: definition.id,
      label: definition.label,
      weight: definition.weight,
      previous,
      current,
      factorScoreChange,
      weightedScoreContribution,
      weightedChangeContribution,
      explanation: stringOrNull(raw.explanation),
      evidenceRefs,
      availability,
      confidence,
    };
  });

  return {
    schemaVersion: BMS_FACTOR_SCHEMA_VERSION,
    methodologyVersion: BMS_METHODOLOGY_VERSION,
    comparisonBasis: "same-quarter-prior-year",
    generatedAt: stringOrNull(supplied?.generatedAt ?? supplied?.generated_at),
    factors,
  };
}

export function factorAnalysisFromResearchContext(context: any): BmsFactorAnalysis {
  const period = stringOrNull(context?.period);
  const factorScores = context?.factor_scores && typeof context.factor_scores === "object"
    ? context.factor_scores
    : {};
  const drivers = Array.isArray(context?.fresh_drivers) ? context.fresh_drivers : [];

  return normalizeBmsFactorAnalysis({
    period,
    factor_analysis: {
      generated_at: null,
      factors: BMS_FACTOR_DEFINITIONS.map((definition) => {
        const factorDrivers = drivers.filter((driver: any) => driver?.factor === definition.id);
        const previousPeriod = factorDrivers.map((driver: any) => stringOrNull(driver?.previous_period)).find(Boolean) ?? null;
        const currentPeriod = factorDrivers.map((driver: any) => stringOrNull(driver?.current_period)).find(Boolean) ?? period;
        const previousMetrics = factorDrivers.flatMap((driver: any) => {
          const key = stringOrNull(driver?.metric);
          if (!key) return [];
          return [{ key, label: key.replaceAll("_", " "), value: finiteNumberOrNull(driver?.previous_value), unit: null }];
        });
        const currentMetrics = factorDrivers.flatMap((driver: any) => {
          const key = stringOrNull(driver?.metric);
          if (!key) return [];
          return [{
            key,
            label: key.replaceAll("_", " "),
            value: finiteNumberOrNull(driver?.current_value),
            unit: null,
            displayValue: finiteNumberOrNull(driver?.change_value) === null
              ? null
              : `${finiteNumberOrNull(driver?.change_value)?.toFixed(2)}% change`,
          }];
        });
        const confidences = factorDrivers.map((driver: any) => finiteNumberOrNull(driver?.confidence)).filter((value: number | null): value is number => value !== null);
        const meanConfidence = confidences.length
          ? confidences.reduce((sum: number, value: number) => sum + value, 0) / confidences.length
          : null;
        return {
          id: definition.id,
          previous: { period: previousPeriod, factor_score: null, metrics: previousMetrics },
          current: { period: currentPeriod, factor_score: factorScores[definition.id], metrics: currentMetrics },
          weighted_score_contribution: finiteNumberOrNull(factorScores[definition.id]) === null
            ? null
            : Number(factorScores[definition.id]) * definition.weight,
          explanation: factorDrivers.length
            ? `${factorDrivers.length} fresh ${definition.label.toLowerCase()} measurement${factorDrivers.length === 1 ? "" : "s"} contributed to the current score.`
            : null,
          evidence_refs: factorDrivers.map((driver: any) => `change-record-${driver.change_record_id}`).filter((value: string) => !value.endsWith("undefined")),
          confidence: meanConfidence === null ? "unavailable" : meanConfidence >= 0.8 ? "high" : meanConfidence >= 0.6 ? "medium" : "low",
        };
      }),
    },
  });
}

export const BMS_FACTOR_SCHEMA_DESCRIPTION = {
  schemaVersion: BMS_FACTOR_SCHEMA_VERSION,
  methodologyVersion: BMS_METHODOLOGY_VERSION,
  comparisonBasis: "same-quarter-prior-year",
  factors: BMS_FACTOR_DEFINITIONS,
  rules: [
    "The deterministic BMS V1 score and weights are unchanged.",
    "Previous and current measurements must be tied to dated reporting periods.",
    "Missing values remain null and must never be converted to zero.",
    "Explanations may describe supplied evidence but cannot alter factor scores.",
    "Historical records must not be reconstructed with post-signal information.",
  ],
} as const;
