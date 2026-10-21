import { createHash } from "node:crypto";
import { financialMetric, type FinancialObservation } from "./tapetide-fcs-provider.ts";

/**
 * Approved source policy (19 October 2026): Earnings and Economics come from
 * Tapetide structured quarterly financials; Execution and Balance Sheet still
 * require official-filing extraction. Provider rows are NOT cross-verified
 * against NSE/BSE filings. They enter the scorer only through the existing
 * provisional lane (secondary_discovery + qualified_provisional) and every row
 * carries an explicit disclosure. An FCS is still published only when all four
 * factors are present.
 */
export const PROVIDER_FACTORS = ["earnings", "economics"] as const;
export const OFFICIAL_FACTORS = ["execution", "balance_sheet"] as const;
export const PROVIDER_CONSOLIDATION_BASIS = "provider_reported_basis";
export const PROVIDER_SOURCE_TYPE = "tapetide_structured_financials";
export const PROVIDER_PRODUCER_ID = "tapetide-get-financials";
export const PROVIDER_VALIDATOR_ID = "tapetide-structural-validator-v1";
export const PROVIDER_DISCLOSURE = "Tapetide structured financial data. Not cross-verified with NSE/BSE filings.";

const QUARTER_END = /^\d{4}-(03-31|06-30|09-30|12-31)$/;

export function fiscalQuarterLabel(periodEnd: string): string {
  const year = Number(periodEnd.slice(0, 4));
  const month = periodEnd.slice(5, 7);
  const quarter = { "06": 1, "09": 2, "12": 3, "03": 4 }[month];
  const fiscalYear = month === "03" ? year : year + 1;
  return `Q${quarter} FY${String(fiscalYear).slice(-2)}`;
}

export function priorYearQuarterEnd(periodEnd: string): string {
  return `${Number(periodEnd.slice(0, 4)) - 1}${periodEnd.slice(4)}`;
}

const safeId = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

type ProviderRowSpec = {
  factorId: (typeof PROVIDER_FACTORS)[number];
  metricId: string;
  unit: string;
  sourceLabel: string;
  previous: number;
  current: number;
  observations: FinancialObservation[];
};

/** Latest provider quarter that is on or before the cutoff and has a same-quarter prior-year pair. */
export function latestProviderQuarter(observations: FinancialObservation[], cutoff: string): string | null {
  const ends = [...new Set(observations.filter((item) => item.periodEnd <= cutoff && item.availableAt && item.availableAt <= cutoff)
    .map((item) => item.periodEnd))].sort();
  for (let index = ends.length - 1; index >= 0; index -= 1) {
    if (ends.includes(priorYearQuarterEnd(ends[index]))) return ends[index];
  }
  return null;
}

export function tapetideCanonicalEvidence(input: {
  symbol: string;
  companyName: string;
  cutoff: string;
  targetPeriodEnd: string;
  observations: FinancialObservation[];
  payloadBytes: Buffer;
  archiveUri: string | null;
  capturedAt?: string;
}) {
  const symbol = input.symbol.trim().toUpperCase();
  const capturedAt = input.capturedAt || new Date().toISOString();
  const diagnostics: Array<Record<string, unknown>> = [];
  const empty = { candidates: [] as any[], documents: [] as any[], validations: [] as any[], diagnostics };
  const target = input.targetPeriodEnd;
  if (!QUARTER_END.test(target) || target > input.cutoff) {
    diagnostics.push({ outcome: "provider_target_period_invalid", period_end: target || null });
    return empty;
  }
  if (!input.archiveUri) {
    // Without an immutable archived snapshot the scorer would reject the rows anyway.
    diagnostics.push({ outcome: "provider_snapshot_not_archived", detail: "Tapetide rows need an archived, hashed snapshot." });
    return empty;
  }
  const prior = priorYearQuarterEnd(target);
  const find = (metricId: string, periodEnd: string) => input.observations.find((item) =>
    item.periodEnd === periodEnd && financialMetric(item.label) === metricId);
  const usable = (item: FinancialObservation | undefined): item is FinancialObservation =>
    Boolean(item && item.availableAt && item.availableAt <= input.cutoff);

  const specs: ProviderRowSpec[] = [];
  for (const [metricId, canonical] of [["revenue", "revenue"], ["net_profit", "pat"]] as const) {
    const previous = find(metricId, prior);
    const current = find(metricId, target);
    if (!usable(previous) || !usable(current)) {
      diagnostics.push({ outcome: "provider_metric_unavailable", factor: "earnings", metric: canonical, period_end: target,
        reason: !previous || !current ? "missing_quarter_pair" : "availability_date_missing_or_after_cutoff" });
      continue;
    }
    specs.push({ factorId: "earnings", metricId: canonical, unit: "INR crore", sourceLabel: current.label,
      previous: previous.value, current: current.value, observations: [previous, current] });
  }

  // Economics uses EBITDA margin derived from the provider's unrounded
  // Operating Profit and Sales, not its rounded OPM % column.
  const profitPrevious = find("operating_profit", prior);
  const profitCurrent = find("operating_profit", target);
  const salesPrevious = find("revenue", prior);
  const salesCurrent = find("revenue", target);
  if ([profitPrevious, profitCurrent, salesPrevious, salesCurrent].every(usable)
      && salesPrevious!.value !== 0 && salesCurrent!.value !== 0) {
    specs.push({ factorId: "economics", metricId: "ebitda_margin", unit: "percent",
      sourceLabel: `${profitCurrent!.label} ÷ ${salesCurrent!.label} × 100`,
      previous: Number((profitPrevious!.value / salesPrevious!.value * 100).toFixed(2)),
      current: Number((profitCurrent!.value / salesCurrent!.value * 100).toFixed(2)),
      observations: [profitPrevious!, profitCurrent!, salesPrevious!, salesCurrent!] });
  } else {
    diagnostics.push({ outcome: "provider_metric_unavailable", factor: "economics", metric: "ebitda_margin", period_end: target,
      reason: "operating_profit_or_sales_missing_zero_or_after_cutoff" });
  }
  if (!specs.length) return empty;

  const sha256 = createHash("sha256").update(input.payloadBytes).digest("hex");
  const documentId = `doc-${sha256}`;
  const publishedAt = specs.flatMap((spec) => spec.observations.map((item) => item.availableAt!)).sort().at(-1)!;
  const runId = `run-provider-fcs-${safeId(symbol)}-${target}-${sha256.slice(0, 12)}`;
  const cutoffInstant = `${input.cutoff}T00:00:00.000Z`;
  const document = {
    schema_version: "1.0.0",
    document_id: documentId,
    issuer_symbol: symbol,
    source_url: `tapetide-mcp://get_financials/${encodeURIComponent(symbol)}`,
    resolved_url: `tapetide-mcp://get_financials/${encodeURIComponent(symbol)}`,
    source_type: PROVIDER_SOURCE_TYPE,
    source_tier: "secondary_discovery",
    cross_verification: "not_cross_verified_with_exchange_filing",
    disclosure: PROVIDER_DISCLOSURE,
    published_at: `${publishedAt}T00:00:00.000Z`,
    captured_at: capturedAt,
    archive_uri: input.archiveUri,
    sha256,
    media_type: "application/json",
    content_length: input.payloadBytes.length,
    acquisition_method: "provider_mcp",
    acquisition_status: "acquired",
    failure_reason: null,
  };

  const candidates: any[] = [];
  const validations: any[] = [];
  for (const spec of specs) {
    const candidateId = `candidate-provider-${safeId(symbol)}-${spec.metricId}-${target}`;
    const locator = (periodEnd: string) => ({
      section: "Tapetide get_financials (quarterly)",
      quoted_label: `${spec.sourceLabel} — ${fiscalQuarterLabel(periodEnd)} (provider data, not cross-verified with NSE/BSE)`,
    });
    candidates.push({
      schema_version: "2.0.0",
      candidate_id: candidateId,
      run_id: runId,
      company_symbol: symbol,
      company_name: input.companyName || symbol,
      sector_profile_id: null,
      factor_id: spec.factorId,
      canonical_metric_id: spec.metricId,
      source_metric_label: spec.sourceLabel,
      metric_definition_version: "2.0.0",
      previous_period: { label: fiscalQuarterLabel(prior), end_date: prior, duration_months: 3 },
      current_period: { label: fiscalQuarterLabel(target), end_date: target, duration_months: 3 },
      comparison_basis: "same_quarter_prior_year",
      comparison_rule_id: "same-quarter-prior-year-v1",
      previous_consolidation_basis: PROVIDER_CONSOLIDATION_BASIS,
      current_consolidation_basis: PROVIDER_CONSOLIDATION_BASIS,
      previous_raw_value: spec.previous,
      current_raw_value: spec.current,
      previous_raw_unit: spec.unit,
      current_raw_unit: spec.unit,
      previous_canonical_value: spec.previous,
      current_canonical_value: spec.current,
      canonical_unit: spec.unit,
      conversion_rule_id: "identity-v1",
      previous_document_id: documentId,
      current_document_id: documentId,
      previous_source_locator: locator(prior),
      current_source_locator: locator(target),
      information_cutoff: cutoffInstant,
      extraction_method: "provider_structured_quarterly_financials",
      extractor_version: "tapetide-fcs-evidence-v1",
      producer_id: PROVIDER_PRODUCER_ID,
      producer_confidence: 0.75,
      evidence_source: "provider",
      cross_verification: "not_cross_verified_with_exchange_filing",
      disclosure: PROVIDER_DISCLOSURE,
      captured_at: capturedAt,
    });
    validations.push({
      schema_version: "2.0.0",
      validation_id: `validation-${candidateId}-${PROVIDER_VALIDATOR_ID}`,
      run_id: runId,
      candidate_id: candidateId,
      validator_id: PROVIDER_VALIDATOR_ID,
      validator_version: "1.0.0",
      validation_kind: "deterministic_provider_structure",
      status: "qualified_provisional",
      confidence: 0.75,
      checks: [
        { check_id: "provider.quarter_pair_present", status: "pass", reason_code: null, detail: null },
        { check_id: "provider.available_before_cutoff", status: "pass", reason_code: null, detail: null },
        { check_id: "source.exchange_filing_cross_verification", status: "needs_review",
          reason_code: "not_cross_verified_with_exchange_filing", detail: PROVIDER_DISCLOSURE },
      ],
      validated_at: capturedAt,
    });
  }
  diagnostics.push({ outcome: "provider_earnings_economics_rows_ready", period_end: target,
    factors: [...new Set(specs.map((spec) => spec.factorId))], comparison_count: specs.length, snapshot_sha256: sha256 });
  return { candidates, documents: [document], validations, diagnostics };
}

/**
 * Replace official Earnings/Economics rows with provider rows for the same
 * quarter, so every checkpoint in a three-quarter series uses one definition.
 * Official Execution/Balance Sheet rows are kept unchanged.
 */
export function mergeProviderEvidence(official: { candidates: any[]; documents: any[]; validations: any[]; diagnostics: any[] },
  provider: ReturnType<typeof tapetideCanonicalEvidence>) {
  const providerFactors = new Set<string>(PROVIDER_FACTORS);
  const superseded = official.candidates.filter((candidate) => providerFactors.has(candidate.factor_id));
  const candidates = [...official.candidates.filter((candidate) => !providerFactors.has(candidate.factor_id)), ...provider.candidates];
  const keptIds = new Set(candidates.map((candidate) => candidate.candidate_id));
  const documentIds = new Set(candidates.flatMap((candidate) => [candidate.previous_document_id, candidate.current_document_id]));
  const documents = [...official.documents, ...provider.documents]
    .filter((document, index, all) => documentIds.has(document.document_id)
      && all.findIndex((other) => other.document_id === document.document_id) === index);
  const validations = [...official.validations, ...provider.validations].filter((validation) => keptIds.has(validation.candidate_id));
  const diagnostics = [...official.diagnostics, ...provider.diagnostics];
  if (superseded.length) diagnostics.push({ outcome: "official_earnings_economics_superseded_by_provider_policy",
    comparison_count: superseded.length, metrics: superseded.map((candidate) => candidate.canonical_metric_id) });
  const factorCount = new Set(candidates.map((candidate) => candidate.factor_id)).size;
  diagnostics.push({ outcome: factorCount === 4 ? "mixed_source_four_factor_evidence_ready" : "mixed_source_evidence_incomplete",
    factor_count: factorCount, comparison_count: candidates.length,
    missing_factors: ["earnings", "economics", "execution", "balance_sheet"].filter((factor) =>
      !candidates.some((candidate) => candidate.factor_id === factor)) });
  return { schema_version: "2.0.0", candidates, documents, validations, diagnostics };
}
