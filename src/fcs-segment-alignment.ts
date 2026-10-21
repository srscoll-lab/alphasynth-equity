import { sourceLabelVariants } from "./fundamental-review-source-match.ts";

/**
 * Owner decision (21 Oct 2026) for a three-quarter series: Execution uses the
 * order book when every quarter reports it; otherwise only the named segments
 * present in every quarter (issuers re-cut segment tables between quarters,
 * e.g. Solar's "Domestic Explosives" vs "CIL / Non-CIL / Defence"). With no
 * common measure the series is not comparable and nothing is forced.
 */
export type QuarterEvidence = { periodEnd: string; candidates: any[]; validations: any[]; documents: any[] };
export type AlignmentResult =
  | { aligned: true; measure: "order_book" | "segment_revenue"; segments: string[]; quarters: QuarterEvidence[] }
  | { aligned: false; reason: string; segmentsByQuarter: Record<string, string[]> };

const segmentLabel = (candidate: any) => sourceLabelVariants(candidate?.current_source_locator?.quoted_label)[0] ?? "";
const execution = (quarter: QuarterEvidence) => quarter.candidates.filter((candidate) => candidate.factor_id === "execution");

function keepExecution(quarter: QuarterEvidence, keep: (candidate: any) => boolean): QuarterEvidence {
  const dropped = new Set(execution(quarter).filter((candidate) => !keep(candidate)).map((candidate) => candidate.candidate_id));
  return { ...quarter,
    candidates: quarter.candidates.filter((candidate) => !dropped.has(candidate.candidate_id)),
    validations: quarter.validations.filter((validation) => !dropped.has(validation.candidate_id)) };
}

export function alignExecutionAcrossQuarters(quarters: QuarterEvidence[]): AlignmentResult {
  if (quarters.every((quarter) => execution(quarter).some((candidate) => candidate.canonical_metric_id === "order_book"))) {
    return { aligned: true, measure: "order_book", segments: [],
      quarters: quarters.map((quarter) => keepExecution(quarter, (candidate) => candidate.canonical_metric_id === "order_book")) };
  }
  const segmentsByQuarter = Object.fromEntries(quarters.map((quarter) => [quarter.periodEnd,
    [...new Set(execution(quarter).filter((candidate) => candidate.canonical_metric_id === "segment_revenue").map(segmentLabel).filter(Boolean))].sort()]));
  const lists = Object.values(segmentsByQuarter);
  const common = lists.length ? lists.reduce((shared, list) => shared.filter((label) => list.includes(label))) : [];
  if (!common.length) return { aligned: false, reason: "no_common_execution_measure", segmentsByQuarter };
  return { aligned: true, measure: "segment_revenue", segments: common,
    quarters: quarters.map((quarter) => keepExecution(quarter, (candidate) =>
      candidate.canonical_metric_id === "segment_revenue" && common.includes(segmentLabel(candidate)))) };
}
