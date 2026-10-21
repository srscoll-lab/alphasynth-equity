import { createHash } from "node:crypto";
import type { FinancialObservation } from "./tapetide-fcs-provider.ts";
import { latestMarchOnOrBefore } from "./fundamental-review-history.ts";
import { PROVIDER_CONSOLIDATION_BASIS } from "./tapetide-fcs-evidence.ts";

/**
 * Owner decision (21 Oct 2026, beta): Balance Sheet = Tapetide's latest ANNUAL
 * balance sheet (Borrowings as total debt, 31 March vs the prior 31 March),
 * used for every quarter so a three-quarter series is like-for-like. Provider
 * data, not cross-verified with NSE/BSE, scored in the provisional lane and
 * labelled with its "as at" date.
 */
export const BALANCE_SHEET_SOURCE_TYPE = "tapetide_annual_balance_sheet";
export const BALANCE_SHEET_DISCLOSURE = "Tapetide annual balance sheet (Borrowings). Not cross-verified with NSE/BSE filings.";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const asAt = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export function tapetideBalanceSheetEvidence(input: {
  symbol: string; companyName: string; cutoff: string; targetPeriodEnd: string;
  observations: FinancialObservation[]; payloadBytes: Buffer; archiveUri: string | null; capturedAt?: string;
}) {
  const diagnostics: Array<Record<string, unknown>> = [];
  const empty = { candidates: [] as any[], documents: [] as any[], validations: [] as any[], diagnostics };
  if (!/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(input.targetPeriodEnd)) return empty;
  if (!input.archiveUri) { diagnostics.push({ outcome: "provider_balance_sheet_not_archived" }); return empty; }
  const currentEnd = latestMarchOnOrBefore(input.targetPeriodEnd);
  const previousEnd = `${Number(currentEnd.slice(0, 4)) - 1}-03-31`;
  const usable = (end: string) => input.observations.find((item) => item.periodEnd === end
    && item.availableAt && item.availableAt <= input.cutoff);
  const current = usable(currentEnd), previous = usable(previousEnd);
  if (!current || !previous) {
    diagnostics.push({ outcome: "provider_balance_sheet_unavailable", balance_sheet_end: currentEnd,
      reason: !current ? "latest_annual_borrowings_missing_or_after_cutoff" : "prior_annual_borrowings_missing" });
    return empty;
  }
  const symbol = input.symbol.trim().toUpperCase();
  const capturedAt = input.capturedAt || new Date().toISOString();
  const sha256 = createHash("sha256").update(input.payloadBytes).digest("hex");
  const documentId = `doc-${sha256}`;
  const runId = `run-provider-bs-${symbol.toLowerCase()}-${currentEnd}-${sha256.slice(0, 12)}`;
  const candidateId = `candidate-provider-${symbol.toLowerCase()}-total-debt-${currentEnd}`;
  const label = (end: string) => `${current.label} — annual balance sheet as at ${asAt(end)} (provider data, not cross-verified with NSE/BSE)`;
  const document = {
    schema_version: "1.0.0", document_id: documentId, issuer_symbol: symbol,
    source_url: `tapetide-mcp://get_financials/${encodeURIComponent(symbol)}/balance_sheet`,
    resolved_url: `tapetide-mcp://get_financials/${encodeURIComponent(symbol)}/balance_sheet`,
    source_type: BALANCE_SHEET_SOURCE_TYPE, source_tier: "secondary_discovery",
    cross_verification: "not_cross_verified_with_exchange_filing", disclosure: BALANCE_SHEET_DISCLOSURE,
    published_at: `${current.availableAt}T00:00:00.000Z`, captured_at: capturedAt, archive_uri: input.archiveUri, sha256,
    media_type: "application/json", content_length: input.payloadBytes.length,
    acquisition_method: "provider_mcp", acquisition_status: "acquired", failure_reason: null,
  };
  const candidate = {
    schema_version: "2.0.0", candidate_id: candidateId, run_id: runId, company_symbol: symbol, company_name: input.companyName || symbol,
    sector_profile_id: null, factor_id: "balance_sheet", canonical_metric_id: "total_debt", source_metric_label: current.label,
    metric_definition_version: "2.0.0",
    previous_period: { label: `As at ${asAt(previousEnd)}`, end_date: previousEnd },
    current_period: { label: `As at ${asAt(currentEnd)}`, end_date: currentEnd },
    comparison_basis: "point_in_time_prior_period", comparison_rule_id: "point-in-time-prior-period-v1",
    previous_consolidation_basis: PROVIDER_CONSOLIDATION_BASIS, current_consolidation_basis: PROVIDER_CONSOLIDATION_BASIS,
    previous_raw_value: previous.value, current_raw_value: current.value, previous_raw_unit: "INR crore", current_raw_unit: "INR crore",
    previous_canonical_value: previous.value, current_canonical_value: current.value, canonical_unit: "INR crore",
    conversion_rule_id: "identity-v1", previous_document_id: documentId, current_document_id: documentId,
    previous_source_locator: { section: "Tapetide get_financials (balance_sheet, annual)", quoted_label: label(previousEnd) },
    current_source_locator: { section: "Tapetide get_financials (balance_sheet, annual)", quoted_label: label(currentEnd) },
    information_cutoff: `${input.cutoff}T00:00:00.000Z`, extraction_method: "provider_structured_annual_balance_sheet",
    extractor_version: "tapetide-fcs-balance-sheet-v1", producer_id: "tapetide-get-financials", producer_confidence: 0.75,
    evidence_source: "provider", cross_verification: "not_cross_verified_with_exchange_filing", disclosure: BALANCE_SHEET_DISCLOSURE,
    captured_at: capturedAt,
  };
  const validation = {
    schema_version: "2.0.0", validation_id: `validation-${candidateId}-tapetide-structural-validator-v1`, run_id: runId,
    candidate_id: candidateId, validator_id: "tapetide-structural-validator-v1", validator_version: "1.0.0",
    validation_kind: "deterministic_provider_structure", status: "qualified_provisional", confidence: 0.75,
    checks: [
      { check_id: "provider.annual_pair_present", status: "pass", reason_code: null, detail: null },
      { check_id: "provider.available_before_cutoff", status: "pass", reason_code: null, detail: null },
      { check_id: "source.exchange_filing_cross_verification", status: "needs_review", reason_code: "not_cross_verified_with_exchange_filing", detail: BALANCE_SHEET_DISCLOSURE },
    ],
    validated_at: capturedAt,
  };
  diagnostics.push({ outcome: "provider_balance_sheet_ready", balance_sheet_end: currentEnd, quarter_end: input.targetPeriodEnd, snapshot_sha256: sha256 });
  return { candidates: [candidate], documents: [document], validations: [validation], diagnostics };
}
