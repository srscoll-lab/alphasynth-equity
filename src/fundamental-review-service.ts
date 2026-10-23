import { randomUUID } from "crypto";
import {
  cleanFundamentalReviewSymbol,
  defaultFundamentalReviewMessage,
  isFundamentalReviewInProgress,
  type FundamentalReviewStatus,
} from "./fundamental-review-contract.ts";
import type { FundamentalReviewQueue } from "./fundamental-review-queue.ts";
import type { FundamentalReviewJobRecord, FundamentalReviewStore } from "./fundamental-review-store.ts";
import { assessLifecycle, balanceSheetPeriodAllowed, balanceSheetPeriodEnd, checkpointFromScore, historyMetricDefinitions, mergeCheckpoint, previousQuarterEnd,
  type FcsCheckpoint } from "./fundamental-review-history.ts";
import { alignExecutionAcrossQuarters, type QuarterEvidence } from "./fcs-segment-alignment.ts";
import {fcsPublicationSummaries} from './fcs-publications.ts';
import {DATA_PROVIDER_DAILY_LIMIT,fcsDailyLimitReached,fcsEvidenceFailureMessage,nextIstMidnight} from './fcs-evidence-failure.ts';

type Fetch = typeof fetch;
const REQUIRED_FACTORS = ["earnings", "economics", "execution", "balance_sheet"] as const;

export type FundamentalReviewServiceOptions = {
  store: FundamentalReviewStore;
  queue: FundamentalReviewQueue;
  evidenceUrl: string;
  scoringUrl: string;
  internalToken?: string;
  dossierToken?: string;
  scoringIdentityTokenProvider?: (audience: string) => Promise<string>;
  fetch?: Fetch;
  now?: () => Date;
  historicalBackfillEnabled?: boolean;
  /** Total and per-quarter time for the two earlier quarters (defaults 180 s / 90 s). */
  historyBudgetMs?: number;
  historyRequestMs?: number;
};

export class FundamentalReviewService {
  private readonly options: FundamentalReviewServiceOptions;
  private readonly fetchImpl: Fetch;
  private readonly now: () => Date;

  constructor(options: FundamentalReviewServiceOptions) {
    if (!/^https?:\/\//.test(options.evidenceUrl) || !/^https?:\/\//.test(options.scoringUrl)) {
      throw new Error("Fundamental Review evidence and scoring URLs must be configured.");
    }
    this.options = options;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async request(input: { symbol: string; companyName: string; informationCutoff: string }): Promise<FundamentalReviewJobRecord> {
    const symbol = cleanFundamentalReviewSymbol(input.symbol);
    if (!symbol) throw new Error("A valid company symbol is required.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.informationCutoff)) throw new Error("A valid information cutoff is required.");
    const existing = await this.options.store.readLatest(symbol);
    if (existing && existing.informationCutoff > input.informationCutoff) {
      throw new Error("A new review cannot move the company's information cutoff backwards. Use the preserved historical study instead.");
    }
    if (existing && (isFundamentalReviewInProgress(existing.status)
      || (existing.resultAvailable && existing.informationCutoff >= input.informationCutoff))) return existing;
    // Free data plan: after the daily limit, repeat requests return the paused job until 00:00 IST.
    if (existing?.failureCode === DATA_PROVIDER_DAILY_LIMIT
      && this.now().getTime() < nextIstMidnight(Date.parse(existing.updatedAt))) return existing;
    const timestamp = this.now().toISOString();
    const job: FundamentalReviewJobRecord = {
      jobId: `${symbol.toLowerCase()}-${randomUUID()}`,
      symbol,
      companyName: input.companyName.trim() || symbol,
      status: "queued",
      completedFactors: 0,
      totalFactors: 4,
      requestedAt: timestamp,
      updatedAt: timestamp,
      message: defaultFundamentalReviewMessage("queued"),
      resultAvailable: false,
      informationCutoff: input.informationCutoff,
      evidenceRows: [],
      diagnostics: [],
      scoreResult: null,
      failureCode: null,
      checkpointHistory: existing?.checkpointHistory ?? [],
      lastCompletedLifecycle: existing?.lastCompletedLifecycle ?? null,
    };
    await this.options.store.save(job);
    try {
      await this.options.queue.enqueue({ jobId: job.jobId, symbol });
    } catch (error) {
      await this.transition(job, "failed", {
        failureCode: "QUEUE_ENQUEUE_FAILED",
        message: "The review could not be queued. No FCS was generated.",
      });
      throw error;
    }
    return job;
  }

  async status(symbol: string): Promise<FundamentalReviewJobRecord | null> {
    return this.options.store.readLatest(symbol);
  }
  async publications() {
    if(!this.options.store.listLatest)throw new Error('Publication-list storage is unavailable.');
    return fcsPublicationSummaries(await this.options.store.listLatest(200),this.now().toISOString().slice(0,10));
  }

  private async transition(
    job: FundamentalReviewJobRecord,
    status: FundamentalReviewStatus,
    changes: Partial<FundamentalReviewJobRecord> = {},
  ): Promise<FundamentalReviewJobRecord> {
    Object.assign(job, changes, {
      status,
      updatedAt: this.now().toISOString(),
      message: changes.message || defaultFundamentalReviewMessage(status),
    });
    await this.options.store.save(job);
    return job;
  }

  async execute(task: { jobId: string; symbol: string }): Promise<FundamentalReviewJobRecord> {
    const job = await this.options.store.readJob(task.jobId);
    if (!job || job.symbol !== cleanFundamentalReviewSymbol(task.symbol)) throw new Error("Fundamental Review job was not found.");
    if (!isFundamentalReviewInProgress(job.status)) return job;
    try {
      await this.transition(job, "locating_evidence");
      const evidenceHeaders: Record<string, string> = { "content-type": "application/json" };
      if (this.options.dossierToken) evidenceHeaders["x-dossier-token"] = this.options.dossierToken;
      if (this.options.internalToken) evidenceHeaders["x-fundamental-review-token"] = this.options.internalToken;
      const evidenceResponse = await this.fetchImpl(this.options.evidenceUrl, {
        method: "POST",
        headers: evidenceHeaders,
        body: JSON.stringify({
          ticker: job.symbol,
          company_name: job.companyName,
          information_cutoff: job.informationCutoff,
          missing_factor_ids: REQUIRED_FACTORS,
        }),
        signal: AbortSignal.timeout(9 * 60_000),
      });
      const evidencePayload = await evidenceResponse.json().catch(() => ({})) as Record<string, any>;
      if (!evidenceResponse.ok) throw new Error(`Evidence service returned HTTP ${evidenceResponse.status}.`);
      const candidates = Array.isArray(evidencePayload.candidates) ? evidencePayload.candidates : [];
      const documents = Array.isArray(evidencePayload.documents) ? evidencePayload.documents : [];
      const validations = Array.isArray(evidencePayload.validations) ? evidencePayload.validations : [];
      const diagnostics = Array.isArray(evidencePayload.diagnostics) ? evidencePayload.diagnostics : [];
      const validationByCandidate = new Map(validations.map((validation: any) => [validation?.candidate_id, validation]));
      let qualifiedCandidates = candidates.filter((candidate: any) => {
        const status = validationByCandidate.get(candidate?.candidate_id)?.status;
        return status === "qualified" || status === "qualified_provisional";
      });
      // One quarter for Earnings/Economics/Execution. Balance Sheet may be dated
      // at that quarter or its latest half-year balance sheet (Reg. 33).
      const endOf=(c:any)=>String(c.current_period?.end_date||'');
      const quarterEnds=[...new Set(qualifiedCandidates.filter((c:any)=>c.factor_id!=='balance_sheet').map(endOf).filter(Boolean))].sort();
      const latest=quarterEnds.at(-1) || [...new Set(qualifiedCandidates.map(endOf).filter(Boolean))].sort().at(-1);
      if(latest) {
        const balanceSheetEnds=qualifiedCandidates.filter((c:any)=>c.factor_id==='balance_sheet' && balanceSheetPeriodAllowed(latest,endOf(c))).map(endOf).sort();
        const balanceSheetEnd=balanceSheetEnds.at(-1);
        const before=qualifiedCandidates.length;
        qualifiedCandidates=qualifiedCandidates.filter((c:any)=>c.factor_id==='balance_sheet' ? endOf(c)===balanceSheetEnd : endOf(c)===latest);
        if(qualifiedCandidates.length<before) diagnostics.push({outcome:'mixed_current_periods_not_combined',selected_period:latest,
          balance_sheet_period:balanceSheetEnd||null,excluded_comparisons:before-qualifiedCandidates.length});
      }
      const factors = new Set(qualifiedCandidates.map((candidate: any) => String(candidate?.factor_id || "").trim().toLowerCase())
        .filter((factor: string) => REQUIRED_FACTORS.includes(factor as typeof REQUIRED_FACTORS[number])));
      job.evidenceRows = qualifiedCandidates;
      job.diagnostics = diagnostics;
      job.completedFactors = factors.size;
      await this.transition(job, "validating_factors");
      if (factors.size < REQUIRED_FACTORS.length) {
        return this.transition(job, "incomplete", {
          failureCode: fcsDailyLimitReached(diagnostics) ? DATA_PROVIDER_DAILY_LIMIT : "INSUFFICIENT_VALIDATED_FACTORS",
          message: fcsEvidenceFailureMessage(factors.size,diagnostics),
        });
      }
      await this.transition(job, "scoring");
      const scoreHeaders: Record<string, string> = { "content-type": "application/json" };
      if (this.options.internalToken) scoreHeaders["x-fundamental-review-token"] = this.options.internalToken;
      if (this.options.scoringIdentityTokenProvider) {
        scoreHeaders.authorization = `Bearer ${await this.options.scoringIdentityTokenProvider(this.options.scoringUrl)}`;
      }
      const scoreResponse = await this.fetchImpl(this.options.scoringUrl, {
        method: "POST",
        headers: scoreHeaders,
        body: JSON.stringify({
          job_id: job.jobId,
          symbol: job.symbol,
          information_cutoff: job.informationCutoff,
          // Score exactly the period-aligned rows counted above.
          candidates: qualifiedCandidates,
          documents,
          validations,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const scorePayload = await scoreResponse.json().catch(() => ({})) as Record<string, unknown>;
      if (!scoreResponse.ok) throw new Error(`Scoring service returned HTTP ${scoreResponse.status}.`);
      if (typeof scorePayload.fcs_score !== "number" || !Number.isFinite(scorePayload.fcs_score)
          || scorePayload.score_publishable !== true || (scorePayload.symbol && scorePayload.symbol !== job.symbol)) {
        return this.transition(job, "incomplete", {
          scoreResult: scorePayload,
          failureCode: "SCORE_NOT_PUBLISHABLE",
          message: "Four factors were found, but the authoritative validator did not approve a publishable FCS.",
        });
      }
      job.scoreResult = { ...scorePayload, information_cutoff: job.informationCutoff };
      job.resultAvailable = true;
      // The worker, not a model's assertion, decides whether history is complete.
      await this.completeHistory(job, scoreHeaders, evidenceHeaders, documents, { candidates: qualifiedCandidates, validations });
      return this.transition(job, job.scoreResult.lifecycle_ready === true ? "ready" : "score_ready_lifecycle_pending", {
        message: job.scoreResult.lifecycle_ready === true
          ? "FCS and three-period lifecycle are ready. The assessed reporting periods are shown in the report."
          : job.lastCompletedLifecycle
            ? `Current FCS is ready. Latest-period history is incomplete; the last completed lifecycle ends ${job.lastCompletedLifecycle.latestPeriodEnd}.`
            : "Current FCS is ready; lifecycle is unavailable because comparable quarterly FCS history is incomplete.",
      });
    } catch (error) {
      return this.transition(job, "failed", {
        failureCode: "WORKER_EXECUTION_FAILED",
        message: error instanceof Error ? error.message : "The review worker failed. No score was estimated.",
      });
    }
  }

  private async completeHistory(job: FundamentalReviewJobRecord, scoreHeaders: Record<string, string>, evidenceHeaders: Record<string, string>,
    documents: Array<Record<string, any>>, currentEvidence: { candidates: any[]; validations: any[] }) {
    const score = job.scoreResult!;
    let current = checkpointFromScore({ symbol: job.symbol, score, informationCutoff: job.informationCutoff,
      calculatedAt: this.now().toISOString(), sourceJobId: job.jobId!, documents });
    // Evidence of every quarter that published, kept so Execution can be aligned across them.
    const quarterEvidence: QuarterEvidence[] = current
      ? [{ periodEnd: current.periodEnd, candidates: currentEvidence.candidates, documents, validations: currentEvidence.validations }] : [];
    job.checkpointHistory ??= [];
    if (!current) job.diagnostics.push({ outcome: "current_score_not_quarterly_comparable",
      detail: "Lifecycle requires four scorer-approved factors for the same supported quarter, with consistent period and methodology metadata." });
    if (current) {
      // This job measured the current quarter afresh; a stored checkpoint measured differently is replaced (and logged).
      const stored = job.checkpointHistory.find((item) => item.periodEnd === current!.periodEnd);
      if (stored && stored.comparabilityKey !== current.comparabilityKey) {
        job.diagnostics.push({ outcome: "current_checkpoint_remeasured", period_end: current.periodEnd,
          replaced_job: stored.sourceJobId, replaced_fcs: stored.fcsScore });
        job.checkpointHistory = job.checkpointHistory.filter((item) => item.periodEnd !== current!.periodEnd);
      }
      job.checkpointHistory = mergeCheckpoint(job.checkpointHistory, current);
    }
    await this.transition(job, "lifecycle_processing");
    // Which factors each historical quarter lacked, so the report can say why
    // the lifecycle is pending (e.g. no printed Total Debt for 30 Sep).
    const periodGaps: Array<{ period_end: string; balance_sheet_end: string; missing_factors: string[] }> = [];
    if (current && this.options.historicalBackfillEnabled) {
      // At most two missing periods, with a 3-minute TOTAL history budget.
      // No parallel model fan-out or open-ended retries.
      const deadline = Date.now() + (this.options.historyBudgetMs ?? 180_000);
      let target = previousQuarterEnd(current.periodEnd);
      for (let attempt = 0; attempt < 2; attempt += 1, target = previousQuarterEnd(target)) {
        const cached = job.checkpointHistory.find((item) => item.periodEnd === target);
        if (cached?.comparabilityKey === current.comparabilityKey) continue;
        // A stored quarter measured differently (e.g. another Execution row) would block the
        // lifecycle forever: measure it again; it is replaced only if the new measurement publishes.
        const remeasure = Boolean(cached);
        if (remeasure) job.diagnostics.push({ outcome: "historical_checkpoint_remeasured", period_end: target,
          replaced_job: cached!.sourceJobId, replaced_fcs: cached!.fcsScore });
        if (Date.now() >= deadline - 1000) break;
        try {
          const response = await this.fetchImpl(this.options.evidenceUrl, {
            method: "POST", headers: evidenceHeaders,
            body: JSON.stringify({ ticker: job.symbol, company_name: job.companyName,
              information_cutoff: job.informationCutoff, target_period_end: target,
              required_metric_definitions: historyMetricDefinitions(score),
              missing_factor_ids: REQUIRED_FACTORS }),
            signal: AbortSignal.timeout(Math.max(1, Math.min(this.options.historyRequestMs ?? 90_000, deadline - Date.now()))),
          });
          if (!response.ok) throw new Error(`Historical evidence HTTP ${response.status}`);
          const evidence: any = await response.json();
          if(Array.isArray(evidence.diagnostics))job.diagnostics.push(...evidence.diagnostics.map((d:any)=>({...d,historical_period_end:target})));
          const candidates = Array.isArray(evidence.candidates) ? evidence.candidates.filter((item: any) => item.factor_id === "balance_sheet"
            ? balanceSheetPeriodAllowed(target, String(item.current_period?.end_date || ""))
            : item.current_period?.end_date === target) : [];
          const presentFactors = new Set(candidates.map((item: any) => String(item.factor_id)));
          const gap = { period_end: target, balance_sheet_end: balanceSheetPeriodEnd(target),
            missing_factors: REQUIRED_FACTORS.filter((factor) => !presentFactors.has(factor)) as string[] };
          if (!candidates.length) { periodGaps.push(gap); continue; }
          if (Date.now() >= deadline) continue;
          const scored = await this.fetchImpl(this.options.scoringUrl, {
            method: "POST", headers: scoreHeaders,
            body: JSON.stringify({ symbol: job.symbol, information_cutoff: job.informationCutoff,
              candidates, documents: evidence.documents, validations: evidence.validations }),
            signal: AbortSignal.timeout(Math.max(1, Math.min(30_000, deadline - Date.now()))),
          });
          if (!scored.ok) throw new Error(`Historical scoring HTTP ${scored.status}`);
          const historicalScore: any = await scored.json();
          if (historicalScore?.score_publishable !== true) periodGaps.push({ ...gap,
            missing_factors: Array.isArray(historicalScore?.missing_factors) && historicalScore.missing_factors.length
              ? historicalScore.missing_factors : gap.missing_factors });
          else quarterEvidence.push({ periodEnd: target, candidates, documents: evidence.documents || [], validations: evidence.validations || [] });
          const checkpoint = checkpointFromScore({ symbol: job.symbol, score: historicalScore,
            informationCutoff: job.informationCutoff, calculatedAt: this.now().toISOString(), sourceJobId: job.jobId!, documents: evidence.documents });
          if (checkpoint?.periodEnd === target) {
            if (remeasure) job.checkpointHistory = job.checkpointHistory.filter((item) => item.periodEnd !== target);
            job.checkpointHistory = mergeCheckpoint(job.checkpointHistory, checkpoint);
          }
          await this.transition(job, "lifecycle_processing");
        } catch (error) {
          job.diagnostics.push({ outcome: "historical_checkpoint_incomplete", period_end: target,detail:error instanceof Error?error.message:String(error) });
        }
      }
    }
    let assessment = assessLifecycle(job.checkpointHistory, job.informationCutoff, this.now().toISOString());
    // Three quarters published but Execution was measured differently (e.g. segments
    // worded or cut differently): align to the measures common to all three, rescore
    // with the authoritative scorer, and replace only checkpoints created by this job.
    if (!assessment && current && quarterEvidence.length === 3
        && quarterEvidence.every((quarter) => {
          const existing = job.checkpointHistory!.find((item) => item.periodEnd === quarter.periodEnd);
          return !existing || existing.sourceJobId === job.jobId;
        })) {
      const alignment = alignExecutionAcrossQuarters(quarterEvidence);
      if (!alignment.aligned) {
        job.diagnostics.push({ outcome: "execution_not_comparable_across_quarters", detail: alignment.reason, measures: alignment.segmentsByQuarter });
      } else {
        try {
          const rescored: Array<{ periodEnd: string; score: Record<string, any>; checkpoint: FcsCheckpoint | null }> = [];
          for (const quarter of alignment.quarters) {
            const response = await this.fetchImpl(this.options.scoringUrl, { method: "POST", headers: scoreHeaders,
              body: JSON.stringify({ symbol: job.symbol, information_cutoff: job.informationCutoff,
                candidates: quarter.candidates, documents: quarter.documents, validations: quarter.validations }),
              signal: AbortSignal.timeout(30_000) });
            if (!response.ok) throw new Error(`Aligned scoring HTTP ${response.status}`);
            const alignedScore: any = await response.json();
            rescored.push({ periodEnd: quarter.periodEnd, score: alignedScore, checkpoint: alignedScore?.score_publishable === true
              ? checkpointFromScore({ symbol: job.symbol, score: alignedScore, informationCutoff: job.informationCutoff,
                calculatedAt: this.now().toISOString(), sourceJobId: job.jobId!, documents: quarter.documents }) : null });
          }
          const keys = new Set(rescored.map((item) => item.checkpoint?.comparabilityKey));
          if (rescored.every((item) => item.checkpoint) && keys.size === 1) {
            const periods = new Set(rescored.map((item) => item.periodEnd));
            job.checkpointHistory = job.checkpointHistory!.filter((item) => !periods.has(item.periodEnd));
            for (const item of rescored) job.checkpointHistory = mergeCheckpoint(job.checkpointHistory, item.checkpoint!);
            const latest = rescored.find((item) => item.periodEnd === current!.periodEnd)!;
            // The published FCS uses the same like-for-like measures as its lifecycle.
            Object.assign(score, latest.score, { information_cutoff: job.informationCutoff });
            current = latest.checkpoint;
            job.diagnostics.push({ outcome: "execution_aligned_across_quarters", measure: alignment.measure, segments: alignment.segments });
            assessment = assessLifecycle(job.checkpointHistory, job.informationCutoff, this.now().toISOString());
          } else {
            job.diagnostics.push({ outcome: "execution_alignment_not_publishable", periods: rescored.map((item) => item.periodEnd) });
          }
        } catch (error) {
          job.diagnostics.push({ outcome: "execution_alignment_failed", detail: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    if (assessment && (!job.lastCompletedLifecycle || assessment.latestPeriodEnd > job.lastCompletedLifecycle.latestPeriodEnd)) job.lastCompletedLifecycle = assessment;
    const publishedCurrent = current && job.checkpointHistory.find((item) => item.periodEnd === current.periodEnd);
    const latestReady = Boolean(current && assessment?.latestPeriodEnd === current.periodEnd
      && publishedCurrent?.evidenceDigest === current.evidenceDigest
      && publishedCurrent?.rawScore === current.rawScore && publishedCurrent?.fcsScore === current.fcsScore);
    if (current && publishedCurrent && (publishedCurrent.evidenceDigest !== current.evidenceDigest
        || publishedCurrent.rawScore !== current.rawScore || publishedCurrent.fcsScore !== current.fcsScore)) {
      job.diagnostics.push({ outcome: "checkpoint_revision_requires_explicit_review", period_end: current.periodEnd });
    }
    Object.assign(score, {
      lifecycle_ready: latestReady,
      lifecycle: latestReady ? assessment!.classification : null,
      lifecycle_assessment: job.lastCompletedLifecycle && job.lastCompletedLifecycle.informationCutoff <= job.informationCutoff ? job.lastCompletedLifecycle : null,
      lifecycle_status: latestReady ? "three_comparable_quarters_complete" : "latest_period_history_incomplete",
      current_period: current ? { label: current.periodLabel, end_date: current.periodEnd } : null,
      checkpoints: current ? job.checkpointHistory.filter((item) => item.symbol === job.symbol
        && item.comparabilityKey === current.comparabilityKey && item.periodEnd <= current.periodEnd
        && item.informationCutoff <= job.informationCutoff).slice(-3) : [],
      calculated_at: this.now().toISOString(),
      lifecycle_missing_periods: current ? [previousQuarterEnd(previousQuarterEnd(current.periodEnd)), previousQuarterEnd(current.periodEnd)]
        .filter((end) => !job.checkpointHistory!.some((item) => item.periodEnd === end && item.comparabilityKey === current.comparabilityKey)) : [],
      lifecycle_period_gaps: latestReady ? [] : periodGaps,
      // Owner decision (Option C): Balance Sheet counts only a printed "Total
      // Debt" line, so a half-year without one leaves the lifecycle pending.
      lifecycle_unavailable_reason: latestReady ? null
        : !current ? "current_score_not_quarterly_comparable"
        : job.diagnostics.some((item: any) => item?.historical_period_end && item?.outcome === "tapetide_quota_exhausted") ? "data_provider_daily_limit"
        : periodGaps.some((item) => item.missing_factors.includes("balance_sheet")) ? "balance_sheet_printed_total_debt_not_found"
        : "missing_or_noncomparable_quarterly_history",
    });
  }
}

export function fundamentalReviewRuntimeConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    (environment.FUNDAMENTAL_REVIEW_GCP_PROJECT || environment.GOOGLE_CLOUD_PROJECT || environment.GCP_PROJECT_ID)
    && environment.FUNDAMENTAL_REVIEW_TASKS_LOCATION
    && environment.FUNDAMENTAL_REVIEW_TASKS_QUEUE
    && environment.FUNDAMENTAL_REVIEW_TASKS_SERVICE_ACCOUNT
    && environment.FUNDAMENTAL_REVIEW_WORKER_URL
    && environment.FUNDAMENTAL_REVIEW_EVIDENCE_URL
    && environment.FUNDAMENTAL_REVIEW_SCORING_URL
    && environment.FUNDAMENTAL_REVIEW_INTERNAL_TOKEN,
  );
}
