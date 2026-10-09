import { randomUUID } from "crypto";
import {
  cleanFundamentalReviewSymbol,
  defaultFundamentalReviewMessage,
  isFundamentalReviewInProgress,
  type FundamentalReviewStatus,
} from "./fundamental-review-contract.ts";
import type { FundamentalReviewQueue } from "./fundamental-review-queue.ts";
import type { FundamentalReviewJobRecord, FundamentalReviewStore } from "./fundamental-review-store.ts";
import { assessLifecycle, checkpointFromScore, mergeCheckpoint, previousQuarterEnd } from "./fundamental-review-history.ts";
import {fcsPublicationSummaries} from './fcs-publications.ts';
import {fcsEvidenceFailureMessage} from './fcs-evidence-failure.ts';

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
      const periodEnds=[...new Set(qualifiedCandidates.map((c:any)=>String(c.current_period?.end_date||'')).filter(Boolean))].sort();
      if(periodEnds.length>1) {
        const latest=periodEnds.at(-1);
        const excluded=qualifiedCandidates.length;
        qualifiedCandidates=qualifiedCandidates.filter((c:any)=>c.current_period?.end_date===latest);
        diagnostics.push({outcome:'mixed_current_periods_not_combined',selected_period:latest,excluded_comparisons:excluded-qualifiedCandidates.length});
      }
      const factors = new Set(qualifiedCandidates.map((candidate: any) => String(candidate?.factor_id || "").trim().toLowerCase())
        .filter((factor: string) => REQUIRED_FACTORS.includes(factor as typeof REQUIRED_FACTORS[number])));
      job.evidenceRows = qualifiedCandidates;
      job.diagnostics = diagnostics;
      job.completedFactors = factors.size;
      await this.transition(job, "validating_factors");
      if (factors.size < REQUIRED_FACTORS.length) {
        return this.transition(job, "incomplete", {
          failureCode: "INSUFFICIENT_VALIDATED_FACTORS",
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
          candidates,
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
      await this.completeHistory(job, scoreHeaders, evidenceHeaders, documents);
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

  private async completeHistory(job: FundamentalReviewJobRecord, scoreHeaders: Record<string, string>, evidenceHeaders: Record<string, string>, documents: Array<Record<string, any>>) {
    const score = job.scoreResult!;
    const current = checkpointFromScore({ symbol: job.symbol, score, informationCutoff: job.informationCutoff,
      calculatedAt: this.now().toISOString(), sourceJobId: job.jobId!, documents });
    job.checkpointHistory ??= [];
    if (!current) job.diagnostics.push({ outcome: "current_score_not_quarterly_comparable",
      detail: "Lifecycle requires four scorer-approved factors for the same supported quarter, with consistent period and methodology metadata." });
    if (current) job.checkpointHistory = mergeCheckpoint(job.checkpointHistory, current);
    await this.transition(job, "lifecycle_processing");
    if (current && this.options.historicalBackfillEnabled) {
      // At most two missing periods, with a 3-minute TOTAL history budget.
      // No parallel model fan-out or open-ended retries.
      const deadline = Date.now() + 180_000;
      let target = previousQuarterEnd(current.periodEnd);
      for (let attempt = 0; attempt < 2; attempt += 1, target = previousQuarterEnd(target)) {
        const cached = job.checkpointHistory.find((item) => item.periodEnd === target);
        if (cached) {
          if (cached.comparabilityKey !== current.comparabilityKey) job.diagnostics.push({
            outcome: "historical_checkpoint_harmonisation_required", period_end: target });
          continue;
        }
        if (Date.now() >= deadline - 1000) break;
        try {
          const response = await this.fetchImpl(this.options.evidenceUrl, {
            method: "POST", headers: evidenceHeaders,
            body: JSON.stringify({ ticker: job.symbol, company_name: job.companyName,
              information_cutoff: job.informationCutoff, target_period_end: target,
              required_metric_definitions: (score.factors as any[]).flatMap((factor: any) => factor.impacts.map((impact: any) => ({
                factor: factor.factor_id, metric: impact.metric_id, unit: impact.canonical_unit,
                consolidation_basis: impact.consolidation_basis, comparison_basis: impact.comparison_basis,
              }))),
              missing_factor_ids: REQUIRED_FACTORS }),
            signal: AbortSignal.timeout(Math.max(1, Math.min(90_000, deadline - Date.now()))),
          });
          if (!response.ok) throw new Error(`Historical evidence HTTP ${response.status}`);
          const evidence: any = await response.json();
          if(Array.isArray(evidence.diagnostics))job.diagnostics.push(...evidence.diagnostics.map((d:any)=>({...d,historical_period_end:target})));
          const candidates = Array.isArray(evidence.candidates) ? evidence.candidates.filter((item: any) => item.current_period?.end_date === target) : [];
          if (!candidates.length || Date.now() >= deadline) continue;
          const scored = await this.fetchImpl(this.options.scoringUrl, {
            method: "POST", headers: scoreHeaders,
            body: JSON.stringify({ symbol: job.symbol, information_cutoff: job.informationCutoff,
              candidates, documents: evidence.documents, validations: evidence.validations }),
            signal: AbortSignal.timeout(Math.max(1, Math.min(30_000, deadline - Date.now()))),
          });
          if (!scored.ok) throw new Error(`Historical scoring HTTP ${scored.status}`);
          const checkpoint = checkpointFromScore({ symbol: job.symbol, score: await scored.json(),
            informationCutoff: job.informationCutoff, calculatedAt: this.now().toISOString(), sourceJobId: job.jobId!, documents: evidence.documents });
          if (checkpoint?.periodEnd === target) job.checkpointHistory = mergeCheckpoint(job.checkpointHistory, checkpoint);
          await this.transition(job, "lifecycle_processing");
        } catch (error) {
          job.diagnostics.push({ outcome: "historical_checkpoint_incomplete", period_end: target,detail:error instanceof Error?error.message:String(error) });
        }
      }
    }
    const assessment = assessLifecycle(job.checkpointHistory, job.informationCutoff, this.now().toISOString());
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
      lifecycle_unavailable_reason: latestReady ? null : current ? "missing_or_noncomparable_quarterly_history" : "current_score_not_quarterly_comparable",
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
