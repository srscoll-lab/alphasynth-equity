export type AlternateSourceMetric = {
  metricId: string;
  periodEnd: string;
  periodType: "quarter" | "year";
  value: number;
  unit: string;
  publishedAt: string;
  sourceUrl?: string | null;
};

export type AlternateSourceCompanySnapshot = {
  symbol: string;
  provider: string;
  metrics: AlternateSourceMetric[];
};

export type AlternateSourceComparison = {
  symbol: string;
  metricId: string;
  periodEnd: string;
  status: "match" | "mismatch" | "not_comparable";
  providerValue: number | null;
  officialValue: number | null;
  relativeDifferencePct: number | null;
  reason: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function normalizedUnit(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_").replace("₹", "inr");
}

function validMetric(metric: AlternateSourceMetric): boolean {
  return Boolean(metric.metricId.trim())
    && ISO_DATE.test(metric.periodEnd)
    && ISO_DATE.test(metric.publishedAt)
    && Number.isFinite(metric.value)
    && Boolean(normalizedUnit(metric.unit));
}

function key(metric: AlternateSourceMetric): string {
  return `${metric.metricId.trim().toLowerCase()}|${metric.periodType}|${metric.periodEnd}`;
}

export function compareAlternateSourceWithOfficial(input: {
  provider: AlternateSourceCompanySnapshot;
  official: AlternateSourceCompanySnapshot;
  cutoff: string;
  amountTolerancePct?: number;
  rateTolerancePoints?: number;
}): AlternateSourceComparison[] {
  const amountTolerancePct = input.amountTolerancePct ?? 0.5;
  const rateTolerancePoints = input.rateTolerancePoints ?? 0.05;
  const official = new Map(input.official.metrics.filter(validMetric).map((metric) => [key(metric), metric]));
  return input.provider.metrics.map((providerMetric) => {
    const base = { symbol: input.provider.symbol, metricId: providerMetric.metricId, periodEnd: providerMetric.periodEnd };
    if (!validMetric(providerMetric)) return { ...base, status: "not_comparable" as const, providerValue: null, officialValue: null, relativeDifferencePct: null, reason: "invalid_provider_metric" };
    if (providerMetric.publishedAt > input.cutoff) return { ...base, status: "not_comparable" as const, providerValue: providerMetric.value, officialValue: null, relativeDifferencePct: null, reason: "provider_publication_after_cutoff" };
    const officialMetric = official.get(key(providerMetric));
    if (!officialMetric) return { ...base, status: "not_comparable" as const, providerValue: providerMetric.value, officialValue: null, relativeDifferencePct: null, reason: "official_comparison_missing" };
    if (officialMetric.publishedAt > input.cutoff) return { ...base, status: "not_comparable" as const, providerValue: providerMetric.value, officialValue: officialMetric.value, relativeDifferencePct: null, reason: "official_publication_after_cutoff" };
    if (!officialMetric.sourceUrl) return { ...base, status: "not_comparable" as const, providerValue: providerMetric.value, officialValue: officialMetric.value, relativeDifferencePct: null, reason: "official_source_url_missing" };
    if (normalizedUnit(providerMetric.unit) !== normalizedUnit(officialMetric.unit)) return { ...base, status: "not_comparable" as const, providerValue: providerMetric.value, officialValue: officialMetric.value, relativeDifferencePct: null, reason: "unit_mismatch" };

    const difference = Math.abs(providerMetric.value - officialMetric.value);
    const isRate = /(?:%|percent|percentage_point|bps)/i.test(providerMetric.unit);
    const relativeDifferencePct = officialMetric.value === 0 ? (difference === 0 ? 0 : null) : difference / Math.abs(officialMetric.value) * 100;
    const matches = isRate ? difference <= rateTolerancePoints : relativeDifferencePct !== null && relativeDifferencePct <= amountTolerancePct;
    return {
      ...base,
      status: matches ? "match" as const : "mismatch" as const,
      providerValue: providerMetric.value,
      officialValue: officialMetric.value,
      relativeDifferencePct,
      reason: matches ? "within_tolerance" : "outside_tolerance",
    };
  });
}

export function summarizeAlternateSourceAudit(comparisons: AlternateSourceComparison[]) {
  const comparable = comparisons.filter((item) => item.status !== "not_comparable");
  const matches = comparable.filter((item) => item.status === "match");
  return {
    observations: comparisons.length,
    comparable: comparable.length,
    matches: matches.length,
    mismatches: comparable.length - matches.length,
    agreementPct: comparable.length ? Number((matches.length / comparable.length * 100).toFixed(1)) : null,
    publishable: false,
  };
}
