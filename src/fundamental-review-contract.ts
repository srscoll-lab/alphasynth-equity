export const FUNDAMENTAL_REVIEW_STATUSES = [
  "not_started",
  "queued",
  "locating_evidence",
  "validating_factors",
  "scoring",
  "lifecycle_processing",
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
    resultAvailable: raw.resultAvailable === true || raw.result_available === true || status === "ready",
  };
}

export function defaultFundamentalReviewMessage(status: FundamentalReviewStatus): string {
  switch (status) {
    case "queued": return "The review is queued. You may leave this page and return later.";
    case "locating_evidence": return "Locating dated company and exchange evidence.";
    case "validating_factors": return "Validating Earnings, Economics, Execution and Balance Sheet evidence.";
    case "scoring": return "The four-factor evidence contract passed and the score is being calculated.";
    case "lifecycle_processing": return "The Fundamental Change Score is ready; lifecycle history is being evaluated.";
    case "ready": return "The Fundamental Change Score and lifecycle report are ready.";
    case "incomplete": return "The review finished without enough comparable evidence for a publishable score.";
    case "failed": return "The review could not be completed. No score was estimated.";
    default: return "No Fundamental Change Review has been requested.";
  }
}

export function isFundamentalReviewInProgress(status: FundamentalReviewStatus): boolean {
  return ["queued", "locating_evidence", "validating_factors", "scoring", "lifecycle_processing"].includes(status);
}
