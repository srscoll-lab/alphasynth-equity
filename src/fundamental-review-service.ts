import { randomUUID } from "crypto";
import {
  cleanFundamentalReviewSymbol,
  defaultFundamentalReviewMessage,
  isFundamentalReviewInProgress,
  type FundamentalReviewStatus,
} from "./fundamental-review-contract.ts";
import type { FundamentalReviewQueue } from "./fundamental-review-queue.ts";
import type { FundamentalReviewJobRecord, FundamentalReviewStore } from "./fundamental-review-store.ts";

type Fetch = typeof fetch;
const REQUIRED_FACTORS = ["earnings", "economics", "execution", "balance_sheet"] as const;

export type FundamentalReviewServiceOptions = {
  store: FundamentalReviewStore;
  queue: FundamentalReviewQueue;
  evidenceUrl: string;
  scoringUrl: string;
  internalToken?: string;
  dossierToken?: string;
  fetch?: Fetch;
  now?: () => Date;
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
    if (existing && (isFundamentalReviewInProgress(existing.status) || existing.resultAvailable)) return existing;
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
        signal: AbortSignal.timeout(12 * 60_000),
      });
      const evidencePayload = await evidenceResponse.json().catch(() => ({})) as Record<string, any>;
      if (!evidenceResponse.ok) throw new Error(`Evidence service returned HTTP ${evidenceResponse.status}.`);
      const candidates = Array.isArray(evidencePayload.candidates) ? evidencePayload.candidates : [];
      const documents = Array.isArray(evidencePayload.documents) ? evidencePayload.documents : [];
      const validations = Array.isArray(evidencePayload.validations) ? evidencePayload.validations : [];
      const diagnostics = Array.isArray(evidencePayload.diagnostics) ? evidencePayload.diagnostics : [];
      const validationByCandidate = new Map(validations.map((validation: any) => [validation?.candidate_id, validation]));
      const qualifiedCandidates = candidates.filter((candidate: any) => {
        const status = validationByCandidate.get(candidate?.candidate_id)?.status;
        return status === "qualified" || status === "qualified_provisional";
      });
      const factors = new Set(qualifiedCandidates.map((candidate: any) => String(candidate?.factor_id || "").trim().toLowerCase())
        .filter((factor: string) => REQUIRED_FACTORS.includes(factor as typeof REQUIRED_FACTORS[number])));
      job.evidenceRows = qualifiedCandidates;
      job.diagnostics = diagnostics;
      job.completedFactors = factors.size;
      await this.transition(job, "validating_factors");
      if (factors.size < REQUIRED_FACTORS.length) {
        return this.transition(job, "incomplete", {
          failureCode: "INSUFFICIENT_VALIDATED_FACTORS",
          message: `The review found ${factors.size} of 4 validated factors. No FCS was estimated.`,
        });
      }
      await this.transition(job, "scoring");
      const scoreHeaders: Record<string, string> = { "content-type": "application/json" };
      if (this.options.internalToken) scoreHeaders["x-fundamental-review-token"] = this.options.internalToken;
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
        signal: AbortSignal.timeout(120_000),
      });
      const scorePayload = await scoreResponse.json().catch(() => ({})) as Record<string, unknown>;
      if (!scoreResponse.ok) throw new Error(`Scoring service returned HTTP ${scoreResponse.status}.`);
      if (typeof scorePayload.fcs_score !== "number" || scorePayload.score_publishable !== true) {
        return this.transition(job, "incomplete", {
          scoreResult: scorePayload,
          failureCode: "SCORE_NOT_PUBLISHABLE",
          message: "Four factors were found, but the authoritative validator did not approve a publishable FCS.",
        });
      }
      job.scoreResult = scorePayload;
      job.resultAvailable = true;
      if (scorePayload.lifecycle_ready === true) return this.transition(job, "ready");
      return this.transition(job, "score_ready_lifecycle_pending");
    } catch (error) {
      return this.transition(job, "failed", {
        failureCode: "WORKER_EXECUTION_FAILED",
        message: error instanceof Error ? error.message : "The review worker failed. No score was estimated.",
      });
    }
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
