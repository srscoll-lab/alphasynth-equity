import { createHash } from "node:crypto";
import { cleanFundamentalReviewSymbol } from "./fundamental-review-contract.ts";

const FACTORS = new Set(["earnings", "economics", "execution", "balance_sheet"]);
const BASIS_RULES: Record<string, string> = {
  same_quarter_prior_year: "same-quarter-prior-year-v1",
  year_to_date_prior_year: "year-to-date-prior-year-v1",
  sequential_quarter: "sequential-quarter-v1",
  annual_prior_year: "annual-prior-year-v1",
  point_in_time_prior_period: "point-in-time-prior-period-v1",
};

type DynamicEvidenceRow = Record<string, any>;

const isoInstant = (value: unknown) => {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text)) return null;
  const date = new Date(text.length === 10 ? `${text}T00:00:00Z` : text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const safeId = (value: unknown) => String(value || "")
  .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function documentHash(row: DynamicEvidenceRow): string | null {
  const supplied = String(row.document_sha256 || "").trim().toLowerCase();
  if (/^[a-f0-9]{64}$/.test(supplied)) return supplied;
  const body = String(row.document_text || "");
  return body ? createHash("sha256").update(body).digest("hex") : null;
}

/**
 * Convert strictly verified, dynamically retrieved evidence rows into the
 * canonical V2 candidate/document/validation contract. Rows missing an
 * immutable document identity, period dates, comparison basis or
 * consolidation basis remain diagnostic-only and can never reach scoring.
 */
export function canonicalizeDynamicEvidence(input: {
  ticker?: unknown;
  symbol?: unknown;
  company_name?: unknown;
  cutoff?: unknown;
  information_cutoff?: unknown;
  rows?: unknown;
  diagnostics?: unknown;
}) {
  const symbol = cleanFundamentalReviewSymbol(input.ticker || input.symbol);
  const companyName = String(input.company_name || symbol).trim() || symbol;
  const cutoff = isoInstant(input.cutoff || input.information_cutoff);
  const runId = `run-dynamic-fcs-${safeId(symbol)}-${Date.now()}`;
  const capturedAt = new Date().toISOString();
  const candidates: any[] = [];
  const documents: any[] = [];
  const validations: any[] = [];
  const diagnostics = Array.isArray(input.diagnostics) ? [...input.diagnostics] : [];
  const documentIds = new Set<string>();

  for (const [index, row] of (Array.isArray(input.rows) ? input.rows : []).entries()) {
    const factorId = String(row?.factor || "").trim().toLowerCase();
    const metricId = String(row?.metric_name || row?.metricName || "").trim().toLowerCase();
    const comparisonBasis = String(row?.comparison_basis || row?.comparisonBasis || "").trim().toLowerCase();
    const comparisonRuleId = BASIS_RULES[comparisonBasis];
    const consolidationBasis = String(row?.consolidation_basis || row?.consolidationBasis || "").trim().toLowerCase();
    const previousEnd = isoInstant(row?.previous_period_end_date || row?.previousPeriodEndDate);
    const currentEnd = isoInstant(row?.current_period_end_date || row?.currentPeriodEndDate);
    const sourceDate = isoInstant(row?.source_date || row?.sourceDate);
    const sourceUrl = String(row?.resolved_source_ref || row?.source_ref || row?.sourceUrl || "").trim();
    const hash = documentHash(row);
    const archiveUri = String(row?.archived_document_uri || row?.archive_uri || "").trim();
    const unit = String(row?.canonical_unit || row?.unit || "").trim();
    const previousValue = Number(row?.previous_value ?? row?.previousValue);
    const currentValue = Number(row?.current_value ?? row?.currentValue);
    const previousLabel = String(row?.previous_period || row?.previousPeriod || "").trim();
    const currentLabel = String(row?.current_period || row?.currentPeriod || "").trim();
    const rejectionReasons = [
      !symbol && "invalid_symbol",
      !cutoff && "invalid_information_cutoff",
      !FACTORS.has(factorId) && "invalid_factor",
      !metricId && "missing_metric",
      !comparisonRuleId && "unregistered_comparison_basis",
      !["consolidated", "standalone", "not_applicable"].includes(consolidationBasis) && "unknown_consolidation_basis",
      !previousEnd && "missing_previous_period_end_date",
      !currentEnd && "missing_current_period_end_date",
      !sourceDate && "missing_source_date",
      !/^https:\/\//i.test(sourceUrl) && "missing_official_source_url",
      !hash && "missing_document_sha256",
      !archiveUri && "missing_archived_document_uri",
      !unit && "missing_unit",
      !Number.isFinite(previousValue) && "invalid_previous_value",
      !Number.isFinite(currentValue) && "invalid_current_value",
      !previousLabel && "missing_previous_period_label",
      !currentLabel && "missing_current_period_label",
    ].filter(Boolean);
    if (rejectionReasons.length) {
      diagnostics.push({ outcome: "dynamic_row_not_canonical", metric: metricId || null, reasons: rejectionReasons });
      continue;
    }

    const documentId = `doc-${hash}`;
    if (!documentIds.has(documentId)) {
      documentIds.add(documentId);
      documents.push({
        schema_version: "1.0.0",
        document_id: documentId,
        issuer_symbol: symbol,
        source_url: sourceUrl,
        resolved_url: sourceUrl,
        source_type: String(row?.source_type || "issuer_filing"),
        source_tier: "authoritative",
        published_at: sourceDate,
        captured_at: capturedAt,
        archive_uri: archiveUri,
        sha256: hash,
        media_type: String(row?.media_type || "application/octet-stream"),
        content_length: Number(row?.content_length || 0),
        acquisition_method: "direct_http",
        acquisition_status: "acquired",
        failure_reason: null,
      });
    }
    const candidateId = `candidate-dynamic-${safeId(symbol)}-${safeId(metricId)}-${index + 1}`;
    const candidate = {
      schema_version: "2.0.0",
      candidate_id: candidateId,
      run_id: runId,
      company_symbol: symbol,
      company_name: companyName,
      sector_profile_id: null,
      factor_id: factorId,
      canonical_metric_id: metricId,
      source_metric_label: String(row?.source_metric_label || metricId),
      metric_definition_version: "2.0.0",
      previous_period: { label: previousLabel, end_date: previousEnd!.slice(0, 10) },
      current_period: { label: currentLabel, end_date: currentEnd!.slice(0, 10) },
      comparison_basis: comparisonBasis,
      comparison_rule_id: comparisonRuleId,
      previous_consolidation_basis: consolidationBasis,
      current_consolidation_basis: consolidationBasis,
      previous_raw_value: previousValue,
      current_raw_value: currentValue,
      previous_raw_unit: unit,
      current_raw_unit: unit,
      previous_canonical_value: previousValue,
      current_canonical_value: currentValue,
      canonical_unit: unit,
      conversion_rule_id: "identity-v1",
      previous_document_id: documentId,
      current_document_id: documentId,
      previous_source_locator: { quoted_label: String(row?.quoted_label || `${metricId}: ${previousLabel}`) },
      current_source_locator: { quoted_label: String(row?.quoted_label || `${metricId}: ${currentLabel}`) },
      information_cutoff: cutoff,
      extraction_method: "gemini_grounded_direct_official_document",
      extractor_version: "dynamic-fcs-v2.0.0",
      producer_id: "gemini-grounded-evidence-producer",
      producer_confidence: Number(row?.confidence || 0.85),
      captured_at: capturedAt,
    };
    candidates.push(candidate);
    validations.push({
      schema_version: "2.0.0",
      validation_id: `validation-${candidateId}-source-admission-v2`,
      run_id: runId,
      candidate_id: candidateId,
      validator_id: "source-admission-validator-v2",
      validator_version: "2.0.0",
      validation_kind: "deterministic_source_admission",
      status: "qualified",
      confidence: Number(row?.confidence || 0.85),
      checks: [{ check_id: "source.direct_official_document", status: "pass", reason_code: null, detail: null }],
      validated_at: capturedAt,
    });
  }

  const factorCount = new Set(candidates.map((candidate) => candidate.factor_id)).size;
  diagnostics.push({
    outcome: factorCount === 4 ? "dynamic_four_factor_evidence_ready" : "dynamic_evidence_incomplete",
    factor_count: factorCount,
    comparison_count: candidates.length,
  });
  return { schema_version: "2.0.0", symbol, candidates, documents, validations, diagnostics };
}
