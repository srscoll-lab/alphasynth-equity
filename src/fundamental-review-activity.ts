import { cleanFundamentalReviewSymbol, isFundamentalReviewInProgress, normalizeFundamentalReviewJob, type FundamentalReviewJob } from "./fundamental-review-contract.ts";

export const REVIEW_JOBS_STORAGE_KEY = "alphasynth.fcs.review-jobs.v1";
type Jobs = Record<string, FundamentalReviewJob>;
export function readStoredReviewJobs(storage?: Pick<Storage, "getItem">): Jobs {
  try {
    const source = storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    const raw = JSON.parse(source?.getItem(REVIEW_JOBS_STORAGE_KEY) || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).flatMap(([key, value]) => {
      const symbol = cleanFundamentalReviewSymbol(key);
      if (!symbol) return [];
      const job = normalizeFundamentalReviewJob(value, { symbol });
      return job.jobId ? [[symbol, job]] : [];
    }));
  } catch { return {}; }
}
let jobs = readStoredReviewJobs();
const listeners = new Set<() => void>();
const pending = new Map<string, Promise<void>>();
export const reviewStatusErrors: Record<string, string> = {};
export const getReviewJobs = () => jobs;
export function subscribeReviewJobs(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setReviewJobs(update: Jobs | ((current: Jobs) => Jobs)) {
  jobs = typeof update === "function" ? update(jobs) : update;
  try { window.localStorage.setItem(REVIEW_JOBS_STORAGE_KEY, JSON.stringify(jobs)); } catch { /* Session tracking still works. */ }
  listeners.forEach((listener) => listener());
}
export function trackReviewJob(job: FundamentalReviewJob) {
  if (!job.symbol || !job.jobId) return;
  setReviewJobs((current) => {
    const previous = current[job.symbol];
    if (previous && previous.updatedAt > job.updatedAt) return current;
    return { ...current, [job.symbol]: job };
  });
}
export function refreshReviewJob(symbol: string): Promise<void> {
  if (pending.has(symbol)) return pending.get(symbol)!;
  const work = (async () => {
    const previous = jobs[symbol];
    if (!previous) return;
    try {
      // Leave room for the gateway's 30-second private-worker startup allowance.
      const response = await fetch(`/api/bms/fundamental-review/status/${encodeURIComponent(symbol)}`, { cache: "no-store", signal: AbortSignal.timeout(35_000) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Status check unavailable. Last known status shown.");
      const next = normalizeFundamentalReviewJob(payload.job || payload, { symbol, companyName: previous.companyName });
      if (!next.jobId) throw new Error("No job confirmation received. Last known status shown.");
      delete reviewStatusErrors[symbol];
      trackReviewJob(next);
    } catch (error) {
      reviewStatusErrors[symbol] = error instanceof Error ? error.message : "Status temporarily unavailable.";
      setReviewJobs((current) => ({ ...current }));
    }
  })().finally(() => pending.delete(symbol));
  pending.set(symbol, work);
  return work;
}
export function startReviewActivityPolling() {
  // Only the always-mounted app control owns background polling.
  const refresh = () => {
    if (document.hidden) return;
    void Promise.all(Object.values(jobs).filter((job) => isFundamentalReviewInProgress(job.status)).map((job) => refreshReviewJob(job.symbol)));
  };
  void Promise.all(Object.keys(jobs).map(refreshReviewJob));
  const timer = window.setInterval(refresh, 15_000);
  const visible = () => { if (!document.hidden) refresh(); };
  const storage = (event: StorageEvent) => {
    if (event.key !== REVIEW_JOBS_STORAGE_KEY) return;
    const stored = readStoredReviewJobs();
    jobs = { ...jobs, ...stored };
    listeners.forEach((listener) => listener());
  };
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("storage", storage);
  return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("storage", storage); };
}
export function reviewActivityLabel(status: FundamentalReviewJob["status"]) {
  return { not_started: "No review requested", queued: "Waiting to start", locating_evidence: "Finding evidence", validating_factors: "Checking four factors", scoring: "Calculating FCS", lifecycle_processing: "Checking lifecycle history", score_ready_lifecycle_pending: "FCS ready · lifecycle history pending", ready: "FCS and lifecycle ready", incomplete: "Review finished — no FCS generated", failed: "Review failed — processing stopped" }[status];
}
