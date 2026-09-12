export const BMS_FACTOR_SCHEMA_VERSION = "1.0.0" as const;
export const BMS_METHODOLOGY_VERSION = "BMS_V1" as const;

export const BMS_FACTOR_DEFINITIONS = [
  { id: "earnings", label: "Earnings", weight: 0.25, cadence: "quarterly", purpose: "Whether reported earnings momentum is accelerating or weakening.", evidenceSignals: "Revenue, PAT, EPS and margins" },
  { id: "economics", label: "Economics", weight: 0.25, cadence: "quarterly_or_event_driven", purpose: "Whether the underlying business and industry economics are becoming more or less favourable.", evidenceSignals: "Demand, pricing, input costs, mix and industry capacity" },
  { id: "execution", label: "Execution", weight: 0.25, cadence: "quarterly", purpose: "Whether operating plans are converting into measurable business outputs.", evidenceSignals: "Volumes, utilisation, order conversion, launches and milestones" },
  { id: "balance_sheet", label: "Balance sheet", weight: 0.15, cadence: "half_yearly_or_annual", purpose: "Whether growth is supported by financial resilience rather than balance-sheet strain.", evidenceSignals: "Net debt, cash flow, working capital, coverage and capex" },
  { id: "management_delivery", label: "Management delivery", weight: 0.10, cadence: "rolling_commitment_history", purpose: "Whether management delivers against earlier stated commitments.", evidenceSignals: "Guidance, dated milestones, capital allocation and reported outcomes" },
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

const inferredMetricUnit = (key: string): string | null => {
  const normalized = key.toLowerCase();
  if (/margin|rate|growth|yield|return/.test(normalized)) return "%";
  if (/eps|earnings_per_share/.test(normalized)) return "₹ per share";
  if (/revenue|sales|income|pat|profit|ebitda|ebit|cash|debt|capex/.test(normalized)) return "₹ crore";
  return null;
};

const compactNumber = (value: number) => new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
}).format(value);

const metricDisplayValue = (key: string, value: number | null, change: number | null) => {
  if (value === null) return null;
  const unit = inferredMetricUnit(key);
  const base = unit === "₹ crore"
    ? `₹${compactNumber(value)} crore`
    : unit === "₹ per share"
      ? `₹${compactNumber(value)} per share`
      : unit === "%"
        ? `${compactNumber(value)}%`
        : compactNumber(value);
  if (change === null) return base;
  const signedChange = `${change > 0 ? "+" : ""}${compactNumber(change)}%`;
  return unit === "%"
    ? `${base} (${signedChange} relative change)`
    : `${base} (${signedChange} change)`;
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
          return [{ key, label: key.replaceAll("_", " "), value: finiteNumberOrNull(driver?.previous_value), unit: inferredMetricUnit(key) }];
        });
        const currentMetrics = factorDrivers.flatMap((driver: any) => {
          const key = stringOrNull(driver?.metric);
          if (!key) return [];
          const currentValue = finiteNumberOrNull(driver?.current_value);
          const changeValue = finiteNumberOrNull(driver?.change_value);
          return [{
            key,
            label: key.replaceAll("_", " "),
            value: currentValue,
            unit: inferredMetricUnit(key),
            displayValue: metricDisplayValue(key, currentValue, changeValue),
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

/**
 * Adds report-facing comparison evidence that has already been deterministically
 * reconstructed by the delivery bridge. It never changes a BMS V1 factor score.
 * Quarterly delivery can provide a comparable Execution measure. Dated
 * balance-sheet checks and a scored management history are shown as current-only
 * supporting evidence until an equally defined earlier observation exists.
 */
export function augmentFactorAnalysisWithDeliveryEvidence(
  analysis: BmsFactorAnalysis | null | undefined,
  deliveryCheck: any,
  evidenceDossier?: any,
): BmsFactorAnalysis | null {
  if (!analysis) return null;
  let factors = analysis.factors;
  const execution = factors.find(factor => factor.id === "execution");
  const alreadyHasComparableExecution = Boolean(
    execution?.previous.metrics.length && execution?.current.metrics.length,
  );
  const executionMetric = deliveryCheck?.input?.deliveryMetrics?.find((row: any) => row?.id === "revenue_growth");
  if (execution && !alreadyHasComparableExecution
    && Number.isFinite(executionMetric?.expected) && Number.isFinite(executionMetric?.actual)) {
    const component = deliveryCheck?.assessment?.deliveryComponents?.find((row: any) => row?.id === "revenue_growth");
    const previousPeriod = deliveryCheck?.input?.expectationFreezeDate || null;
    const currentPeriod = deliveryCheck?.input?.outcomeDate || deliveryCheck?.input?.expectationFreezeDate || null;
    factors = factors.map(factor => factor.id !== "execution" ? factor : {
      ...factor,
      previous: {
        ...factor.previous,
        period: factor.previous.period || previousPeriod,
        metrics: [{ key: "revenue_growth_baseline", label: "Previous YoY revenue-growth reading", value: executionMetric.expected, unit: "%", displayValue: null }],
      },
      current: {
        ...factor.current,
        period: factor.current.period || currentPeriod,
        metrics: [{ key: "revenue_growth_current", label: "Current YoY revenue-growth reading", value: executionMetric.actual, unit: "%", displayValue: component?.direction || null }],
      },
      explanation: "Published quarterly revenue was compared with its prior YoY growth baseline as generic execution evidence. This reconstruction explains delivery but does not alter the recorded BMS V1 score.",
      evidenceRefs: [...new Set([...(factor.evidenceRefs || []), ...(executionMetric.evidenceRefs || [])])],
      availability: "complete" as const,
      confidence: factor.confidence === "unavailable" ? "low" as const : factor.confidence,
    });
  }

  const balanceFactor = factors.find(factor => factor.id === "balance_sheet");
  const hasBalanceEvidence = Boolean(balanceFactor?.previous.metrics.length || balanceFactor?.current.metrics.length);
  const balanceIds = new Set(["cash_conversion", "leverage_coverage", "working_capital", "incremental_roce"]);
  const balanceChecks = (Array.isArray(deliveryCheck?.input?.qualityGates) ? deliveryCheck.input.qualityGates : [])
    .filter((row: any) => balanceIds.has(row?.id) && ["pass", "fail"].includes(row?.result)
      && Array.isArray(row?.evidenceRefs) && row.evidenceRefs.length > 0);
  const balanceEvidenceRefs = [...new Set(balanceChecks.flatMap((row: any) => row.evidenceRefs))] as string[];
  const balanceEvidenceDates = (Array.isArray(evidenceDossier?.sources) ? evidenceDossier.sources : [])
    .filter((source: any) => balanceEvidenceRefs.includes(source?.sourceId) && /^\d{4}-\d{2}-\d{2}$/.test(source?.publishedAt || ""))
    .map((source: any) => source.publishedAt as string)
    .sort();
  const balanceObservedAt = balanceEvidenceDates.at(-1) || null;
  if (balanceFactor && !hasBalanceEvidence && balanceChecks.length && balanceObservedAt) {
    factors = factors.map(factor => factor.id !== "balance_sheet" ? factor : ({
      ...factor,
      current: {
        ...factor.current,
        period: factor.current.period || balanceObservedAt,
        observedAt: factor.current.observedAt || balanceObservedAt,
        metrics: balanceChecks.map((row: any) => ({
          key: row.id,
          label: row.label,
          value: row.result === "pass" ? "Meets check" : "Concern found",
          unit: null,
          displayValue: null,
        })),
      },
      explanation: "Verified balance-sheet checks are shown as current supporting evidence. A momentum reading remains unavailable until a comparable earlier half-year or annual measurement is supplied.",
      evidenceRefs: balanceEvidenceRefs,
      availability: "partial" as const,
      confidence: "low" as const,
    }));
  }

  const managementFactor = factors.find(factor => factor.id === "management_delivery");
  const hasManagementEvidence = Boolean(managementFactor?.previous.metrics.length || managementFactor?.current.metrics.length);
  const management = deliveryCheck?.managementGuidance?.assessment;
  const managementEvidenceRefs = [...new Set(deliveryCheck?.managementGuidance?.evidenceRefs || [])] as string[];
  if (managementFactor && !hasManagementEvidence && Number.isFinite(management?.score) && managementEvidenceRefs.length) {
    const componentMetrics = [
      ["matured_delivery", "Matured commitments delivered", management?.components?.maturedDelivery?.score],
      ["revision_discipline", "Revision discipline", management?.components?.revisionDiscipline?.score],
      ["disclosure_quality", "Disclosure quality", management?.components?.disclosureQuality?.score],
    ].flatMap(([key, label, value]) => Number.isFinite(value)
      ? [{ key: String(key), label: String(label), value: Number(value), unit: "/100", displayValue: null }]
      : []);
    factors = factors.map(factor => factor.id !== "management_delivery" ? factor : ({
      ...factor,
      current: {
        ...factor.current,
        period: factor.current.period || management.asOfDate || null,
        metrics: [
          { key: "management_delivery_record", label: "Current delivery record", value: Number(management.score), unit: "/100", displayValue: null },
          ...componentMetrics,
        ],
      },
      explanation: "The current deterministic management-delivery record is shown separately from BMS V1. A momentum reading requires another comparable, time-stamped management-history assessment.",
      evidenceRefs: managementEvidenceRefs,
      availability: "partial" as const,
      confidence: (["high", "medium", "low"] as const).includes(management.evidenceConfidence)
        ? management.evidenceConfidence
        : "low" as const,
    }));
  }
  return { ...analysis, factors };
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
