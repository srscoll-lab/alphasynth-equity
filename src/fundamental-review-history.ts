import { createHash } from "node:crypto";

export const HISTORY_METHOD = "BMS_V2_1_TRAJECTORY_LIFECYCLE";
const FACTORS = ["earnings", "economics", "execution", "balance_sheet"];
// Preserve explicit bases already present in archive-bound legacy evidence.
// They remain distinct in comparabilityKey; never collapse a segment into group data.
export const ACCOUNTING_BASES = new Set([
  "consolidated", "standalone", "not_applicable", "consolidated_ifrs",
  "consolidated_ifrs_excluding_exceptional_items", "consolidated_ind_as", "standalone_ind_as",
  "standalone_operating_basis", "standalone_cash_generation_basis", "group_operating_basis",
  "issuer_defined_segment_basis", "issuer_defined_comparable_basis", "issuer_defined_operating_basis",
  "consolidated_credit_basis", "consolidated_recast_comparable_basis", "consolidated_recast_comparable",
  "consolidated_operating_basis", "consolidated_segment", "consolidated_segment_operating_basis",
  "standalone_plus_joint_operation", "consolidated_excluding_financial_services_borrowing",
]);
export type FcsCheckpoint = {
  symbol: string; periodEnd: string; periodLabel: string; informationCutoff: string;
  calculatedAt: string; rawScore: number; fcsScore: number; completeFactors: 4;
  comparabilityKey: string; evidenceDigest: string; sourceJobId: string;
  evidenceReferences: Array<{ factorId: string; metricId: string; previousDocumentId: string;
    currentDocumentId: string; previousValue: unknown; currentValue: unknown;
    previousLocator: unknown; currentLocator: unknown }>;
  documentReferences: Array<{ documentId: string; sourceUrl: string; archiveUri: string; sha256: string; publishedAt: string }>;
};
export type FcsLifecycleAssessment = {
  classification: string; reason: string; latestPeriodEnd: string;
  informationCutoff: string; calculatedAt: string; methodologyId: string;
  checkpoints: FcsCheckpoint[];
};

export function previousQuarterEnd(periodEnd: string): string {
  const date = new Date(`${periodEnd}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 2, 0)).toISOString().slice(0, 10);
}

/** Only authoritative scorer-approved impacts can establish a checkpoint.
 * Annual/YTD and mixed-period scores must not masquerade as quarterly history.
 */
export function checkpointFromScore(input: {
  symbol: string; score: Record<string, any>; informationCutoff: string;
  calculatedAt: string; sourceJobId: string;
  documents?: Array<Record<string, any>>;
}): FcsCheckpoint | null {
  const { score } = input;
  if (score.symbol !== input.symbol || score.score_publishable !== true || !Number.isFinite(score.raw_score)
      || !Number.isFinite(score.fcs_score) || !Array.isArray(score.factors)
      || !score.methodology_id || !score.impact_policy_id) return null;
  const impacts: any[] = [];
  for (const id of FACTORS) {
    const factor = score.factors.find((factor: any) => factor.factor_id === id);
    if (!factor || !Array.isArray(factor.impacts) || !factor.impacts.length) return null;
    for (const impact of factor.impacts) impacts.push({ ...impact, factor_id: id });
  }
  const ends = new Set(impacts.map((impact) => impact.current_period?.end_date));
  if (ends.size !== 1) return null;
  const periodEnd = [...ends][0];
  if (typeof periodEnd !== "string" || !/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(periodEnd)
      || periodEnd > input.informationCutoff) return null;
  for (const impact of impacts) {
    if (!impact.previous_document_id || !impact.current_document_id || !impact.metric_id
        || !impact.canonical_unit || !impact.previous_period?.end_date
        || !ACCOUNTING_BASES.has(impact.consolidation_basis)
        || !["same_quarter_prior_year", "sequential_quarter", "point_in_time_prior_period"].includes(impact.comparison_basis)) return null;
    if (impact.comparison_basis !== "point_in_time_prior_period") {
      const label = String(impact.current_period?.label || "");
      if (impact.current_period?.duration_months !== 3 && !/^Q[1-4]\b/i.test(label)) return null;
    }
  }
  // Deliberately strict: do not compare differently defined metrics or bases.
  const signature = impacts.map((impact) => [impact.factor_id, impact.metric_id,
    impact.comparison_basis, impact.consolidation_basis, impact.canonical_unit].join("|")).sort();
  return {
    symbol: input.symbol, periodEnd, periodLabel: String(impacts[0].current_period.label || periodEnd),
    informationCutoff: input.informationCutoff, calculatedAt: input.calculatedAt,
    rawScore: score.raw_score, fcsScore: score.fcs_score, completeFactors: 4,
    comparabilityKey: createHash("sha256").update(JSON.stringify([score.methodology_id, score.impact_policy_id, signature])).digest("hex"),
    evidenceDigest: createHash("sha256").update(JSON.stringify(impacts.map((impact) => [impact.factor_id,
      impact.metric_id, impact.previous_value, impact.current_value, impact.previous_period?.end_date,
      impact.current_period?.end_date, impact.previous_document_id, impact.current_document_id]).sort())).digest("hex"),
    sourceJobId: input.sourceJobId,
    evidenceReferences: impacts.map((impact) => ({ factorId: impact.factor_id, metricId: impact.metric_id,
      previousDocumentId: impact.previous_document_id, currentDocumentId: impact.current_document_id,
      previousValue: impact.previous_value ?? null, currentValue: impact.current_value ?? null,
      previousLocator: impact.previous_source_locator ?? null, currentLocator: impact.current_source_locator ?? null })),
    documentReferences: (input.documents ?? []).filter((document) => impacts.some((impact) =>
      [impact.previous_document_id, impact.current_document_id].includes(document.document_id)))
      .map((document) => ({ documentId: String(document.document_id), sourceUrl: String(document.source_url || ""),
        archiveUri: String(document.archive_uri || ""), sha256: String(document.sha256 || ""), publishedAt: String(document.published_at || "") })),
  };
}

export function mergeCheckpoint(history: FcsCheckpoint[], checkpoint: FcsCheckpoint): FcsCheckpoint[] {
  // Never silently overwrite a previously published checkpoint for a period.
  if (history.some((item) => item.periodEnd === checkpoint.periodEnd && item.symbol === checkpoint.symbol)) return history;
  return [...history, checkpoint].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
}

export function assessLifecycle(history: FcsCheckpoint[], cutoff: string, calculatedAt: string): FcsLifecycleAssessment | null {
  const ordered = history.filter((item) => item.informationCutoff <= cutoff && item.periodEnd <= cutoff
    && item.completeFactors === 4 && Number.isFinite(item.rawScore) && Number.isFinite(item.fcsScore)
    && /^[a-f0-9]{64}$/.test(item.comparabilityKey) && /^[a-f0-9]{64}$/.test(item.evidenceDigest)
    && /^\d{4}-(03-31|06-30|09-30|12-31)$/.test(item.periodEnd)).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  for (let index = ordered.length - 1; index >= 2; index -= 1) {
    const checkpoints = ordered.slice(index - 2, index + 1);
    const [earlier, previous, current] = checkpoints;
    if (new Set(checkpoints.map((item) => item.symbol)).size !== 1
        || new Set(checkpoints.map((item) => item.comparabilityKey)).size !== 1
        || previousQuarterEnd(current.periodEnd) !== previous.periodEnd
        || previousQuarterEnd(previous.periodEnd) !== earlier.periodEnd) continue;
    const prior = Number((previous.rawScore - earlier.rawScore).toFixed(4));
    const latest = Number((current.rawScore - previous.rawScore).toFixed(4));
    let classification = "WATCH", reason = "MIXED_OR_FLAT_TRAJECTORY";
    // Exact existing V2.1 thresholds/precedence; parity-tested against its source.
    if (latest <= -0.1) { classification = "FADING"; reason = "LATEST_MATERIAL_DECLINE"; }
    else if (prior <= -0.1 && latest >= 0.03 && current.rawScore < earlier.rawScore - 0.03) {
      classification = "RECOVERING"; reason = "IMPROVING_AFTER_DECLINE_BELOW_EARLIER_LEVEL";
    } else if (prior <= -0.1 && latest >= 0.03 && current.rawScore >= earlier.rawScore - 0.03) {
      classification = "REBOUNDING"; reason = "IMPROVING_AFTER_DECLINE_REGAINED_EARLIER_LEVEL";
    } else if (current.rawScore >= 0.38 && previous.rawScore >= 0.38 && earlier.rawScore >= 0.18
        && latest >= -0.03 && prior >= -0.03) { classification = "ESTABLISHED"; reason = "STRONG_ACROSS_THREE_CHECKPOINTS"; }
    else if (current.rawScore >= 0.38 && prior >= 0.03 && latest >= 0.03) { classification = "BUILDING"; reason = "TWO_CONSECUTIVE_MEANINGFUL_IMPROVEMENTS"; }
    else if (current.rawScore >= 0.18 && latest >= 0.18) { classification = "EMERGING"; reason = "LATEST_SHARP_IMPROVEMENT"; }
    else if (prior <= -0.1 && latest > 0) reason = "POST_DECLINE_STABILISATION_BELOW_RECOVERY_THRESHOLD";
    return { classification, reason, latestPeriodEnd: current.periodEnd, informationCutoff: cutoff,
      calculatedAt, methodologyId: HISTORY_METHOD, checkpoints };
  }
  return null;
}
