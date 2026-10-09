export const FUNDAMENTAL_REVIEW_STATUSES = [
  "not_started",
  "queued",
  "locating_evidence",
  "validating_factors",
  "scoring",
  "lifecycle_processing",
  "score_ready_lifecycle_pending",
  "ready",
  "incomplete",
  "failed",
] as const;

export type FundamentalReviewStatus = typeof FUNDAMENTAL_REVIEW_STATUSES[number];

export type FundamentalReviewJob = {
  jobId: string | null;
  symbol: string;
  companyName: string;
  status: FundamentalReviewStatus;
  completedFactors: number;
  totalFactors: 4;
  requestedAt: string | null;
  updatedAt: string;
  message: string;
  resultAvailable: boolean;
  lastLifecycle?: { classification: string; latestPeriodEnd: string; calculatedAt: string; informationCutoff: string } | null;
};

const statusSet = new Set<string>(FUNDAMENTAL_REVIEW_STATUSES);

export function cleanFundamentalReviewSymbol(value: unknown): string {
  const symbol = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9&.-]{1,24}$/.test(symbol) ? symbol : "";
}

export function normalizeFundamentalReviewJob(
  value: unknown,
  fallback: { symbol: string; companyName?: string },
): FundamentalReviewJob {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const statusCandidate = String(raw.status || raw.job_status || "not_started").trim().toLowerCase();
  const status = statusSet.has(statusCandidate)
    ? statusCandidate as FundamentalReviewStatus
    : "not_started";
  const completedFactorsRaw = Number(raw.completedFactors ?? raw.completed_factors ?? 0);
  const completedFactors = Number.isFinite(completedFactorsRaw)
    ? Math.max(0, Math.min(4, Math.trunc(completedFactorsRaw)))
    : 0;
  const symbol = cleanFundamentalReviewSymbol(raw.symbol) || cleanFundamentalReviewSymbol(fallback.symbol);
  const companyName = String(raw.companyName || raw.company_name || fallback.companyName || symbol).trim();
  const requestedAt = raw.requestedAt || raw.requested_at;
  const updatedAt = raw.updatedAt || raw.updated_at;

  return {
    jobId: raw.jobId || raw.job_id ? String(raw.jobId || raw.job_id) : null,
    symbol,
    companyName,
    status,
    completedFactors,
    totalFactors: 4,
    requestedAt: requestedAt ? String(requestedAt) : null,
    updatedAt: updatedAt ? String(updatedAt) : new Date().toISOString(),
    message: String(raw.message || defaultFundamentalReviewMessage(status)),
    lastLifecycle: (() => {
      const assessment = (raw.lastCompletedLifecycle || raw.lastLifecycle) as Record<string, unknown> | undefined;
      if (!assessment || typeof assessment.classification !== "string" || typeof assessment.latestPeriodEnd !== "string") return null;
      return { classification: assessment.classification, latestPeriodEnd: assessment.latestPeriodEnd,
        calculatedAt: String(assessment.calculatedAt || ""), informationCutoff: String(assessment.informationCutoff || "") };
    })(),
    resultAvailable: status !== "incomplete" && status !== "failed" && raw.resultAvailable !== false && raw.result_available !== false && (raw.resultAvailable === true || raw.result_available === true
      || status === "score_ready_lifecycle_pending" || status === "ready"),
  };
}

export function defaultFundamentalReviewMessage(status: FundamentalReviewStatus): string {
  switch (status) {
    case "queued": return "The review is queued. You may leave this page and return later.";
    case "locating_evidence": return "Locating dated company and exchange evidence.";
    case "validating_factors": return "Validating Earnings, Economics, Execution and Balance Sheet evidence.";
    case "scoring": return "The four-factor evidence contract passed and the score is being calculated.";
    case "lifecycle_processing": return "The Fundamental Change Score is ready; lifecycle history is being evaluated.";
    case "score_ready_lifecycle_pending": return "The Fundamental Change Score is ready. Lifecycle requires three comparable checkpoints.";
    case "ready": return "The Fundamental Change Score and lifecycle report are ready.";
    case "incomplete": return "The review finished without enough comparable evidence for a publishable score.";
    case "failed": return "The review could not be completed. No score was estimated.";
    default: return "No Fundamental Change Review has been requested.";
  }
}

export function isFundamentalReviewInProgress(status: FundamentalReviewStatus): boolean {
  return ["queued", "locating_evidence", "validating_factors", "scoring", "lifecycle_processing"].includes(status);
}

export function publishedFundamentalReviewResult(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const job = normalizeFundamentalReviewJob(record, { symbol: String(record.symbol || "") });
  const score = record.scoreResult as Record<string, unknown> | null;
  if (!["ready", "score_ready_lifecycle_pending", "lifecycle_processing"].includes(job.status)
      || job.completedFactors !== 4 || !job.resultAvailable || !score || score.score_publishable !== true
      || typeof score.fcs_score !== "number" || !Number.isFinite(score.fcs_score)) return null;
  // The already-approved Hindalco policy scores derived EBITDA margin, not
  // absolute EBITDA growth. Preserve old ledgers, but do not re-publish the
  // pre-repair worker output as a valid current report.
  if(job.symbol === 'HINDALCO' && Array.isArray(score.factors)) {
    const economics=(score.factors as any[]).find(factor=>factor.factor_id==='economics');
    if(economics?.impacts?.some((impact:any)=>impact.metric_id==='ebitda')
      && !economics.impacts.some((impact:any)=>impact.metric_id==='ebitda_margin'))return null;
  }
  const permitted = ["fcs_score", "score_publishable", "raw_score", "display_score", "factor_scores", "factors", "lifecycle_ready", "lifecycle", "lifecycle_assessment", "lifecycle_status", "lifecycle_missing_periods", "lifecycle_unavailable_reason", "checkpoints", "calculated_at", "information_cutoff", "comparison_period", "previous_period", "current_period"];
  return Object.fromEntries(permitted.filter((key) => key in score).map((key) => [key, score[key]]));
}

export function publicFundamentalReviewJob(value:unknown,fallback:{symbol:string;companyName?:string}) {
 const raw=value && typeof value==='object'?value as Record<string,any>:{};
 const job=normalizeFundamentalReviewJob(raw,fallback);
 if(raw.scoreResult && ['ready','score_ready_lifecycle_pending'].includes(job.status) && !publishedFundamentalReviewResult(raw)) {
   return {...job,resultAvailable:false,message:'This earlier worker assessment needs scoring-policy reconciliation. The original library report remains available; request a fresh review to update it.'};
 }
 return job;
}
