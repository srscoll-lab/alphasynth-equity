import type { FundamentalReviewJob } from "./fundamental-review-contract.ts";
import { cleanFundamentalReviewSymbol, normalizeFundamentalReviewJob } from "./fundamental-review-contract.ts";
import { createGoogleAccessTokenProvider, googleCloudProjectId } from "./google-cloud-runtime.ts";
import type { FcsCheckpoint, FcsLifecycleAssessment } from "./fundamental-review-history.ts";

type Fetch = typeof fetch;

export type FundamentalReviewJobRecord = FundamentalReviewJob & {
  informationCutoff: string;
  evidenceRows: unknown[];
  diagnostics: unknown[];
  scoreResult: Record<string, unknown> | null;
  failureCode: string | null;
  checkpointHistory?: FcsCheckpoint[];
  lastCompletedLifecycle?: FcsLifecycleAssessment | null;
};

export interface FundamentalReviewStore {
  listLatest?(limit?: number): Promise<FundamentalReviewJobRecord[]>;
  readLatest(symbol: string): Promise<FundamentalReviewJobRecord | null>;
  readJob(jobId: string): Promise<FundamentalReviewJobRecord | null>;
  save(job: FundamentalReviewJobRecord): Promise<void>;
}

export class InMemoryFundamentalReviewStore implements FundamentalReviewStore {
  private readonly jobs = new Map<string, FundamentalReviewJobRecord>();
  private readonly latest = new Map<string, string>();
  async listLatest(limit=200) {return [...this.latest.values()].slice(0,limit).flatMap(id=>{const job=this.jobs.get(id);return job?[structuredClone(job)]:[];});}

  async readLatest(symbol: string): Promise<FundamentalReviewJobRecord | null> {
    const jobId = this.latest.get(cleanFundamentalReviewSymbol(symbol));
    return jobId ? structuredClone(this.jobs.get(jobId) ?? null) : null;
  }

  async readJob(jobId: string): Promise<FundamentalReviewJobRecord | null> {
    return structuredClone(this.jobs.get(jobId) ?? null);
  }

  async save(job: FundamentalReviewJobRecord): Promise<void> {
    if (!job.jobId) throw new Error("A durable Fundamental Review job must have a jobId.");
    this.jobs.set(job.jobId, structuredClone(job));
    this.latest.set(job.symbol, job.jobId);
  }
}

type FirestoreOptions = {
  projectId: string;
  databaseId?: string;
  collection?: string;
  fetch?: Fetch;
  tokenProvider?: () => Promise<string>;
};

function safeDocumentId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.includes("/") || normalized.length > 240) throw new Error("Invalid Firestore document ID.");
  return normalized;
}

function firestoreString(value: string) {
  return { stringValue: value };
}

function recordFromDocument(payload: unknown): FundamentalReviewJobRecord | null {
  const document = payload && typeof payload === "object" ? payload as Record<string, any> : {};
  const encoded = document.fields?.payload?.stringValue;
  if (typeof encoded !== "string") return null;
  const parsed = JSON.parse(encoded) as Partial<FundamentalReviewJobRecord>;
  const normalized = normalizeFundamentalReviewJob(parsed, {
    symbol: String(parsed.symbol || ""),
    companyName: String(parsed.companyName || ""),
  });
  if (!normalized.jobId || !normalized.symbol) return null;
  return {
    ...normalized,
    informationCutoff: String(parsed.informationCutoff || ""),
    evidenceRows: Array.isArray(parsed.evidenceRows) ? parsed.evidenceRows : [],
    diagnostics: Array.isArray(parsed.diagnostics) ? parsed.diagnostics : [],
    scoreResult: parsed.scoreResult && typeof parsed.scoreResult === "object"
      ? parsed.scoreResult as Record<string, unknown>
      : null,
    failureCode: parsed.failureCode ? String(parsed.failureCode) : null,
    checkpointHistory: Array.isArray(parsed.checkpointHistory) ? parsed.checkpointHistory : [],
    lastCompletedLifecycle: parsed.lastCompletedLifecycle ?? null,
  };
}

export class FirestoreFundamentalReviewStore implements FundamentalReviewStore {
  private readonly projectId: string;
  private readonly databaseId: string;
  private readonly collection: string;
  private readonly fetchImpl: Fetch;
  private readonly tokenProvider: () => Promise<string>;

  constructor(options: FirestoreOptions) {
    this.projectId = options.projectId.trim();
    if (!this.projectId) throw new Error("A Google Cloud project is required for the Fundamental Review store.");
    this.databaseId = (options.databaseId || "(default)").trim();
    this.collection = (options.collection || "fundamental_review_jobs_v1").trim();
    if (!/^[A-Za-z0-9_-]+$/.test(this.collection)) throw new Error("Invalid Fundamental Review Firestore collection.");
    this.fetchImpl = options.fetch ?? fetch;
    this.tokenProvider = options.tokenProvider ?? createGoogleAccessTokenProvider({ fetch: this.fetchImpl });
  }

  private baseUrl(): string {
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/${encodeURIComponent(this.databaseId)}/documents`;
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const authorization = `Bearer ${await this.tokenProvider()}`;
    return this.fetchImpl(url, {
      ...init,
      headers: { authorization, ...(init.headers || {}) },
      signal: init.signal || AbortSignal.timeout(20_000),
    });
  }

  private async readDocument(path: string): Promise<FundamentalReviewJobRecord | null> {
    const response = await this.request(`${this.baseUrl()}/${path}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Firestore read failed with HTTP ${response.status}.`);
    return recordFromDocument(await response.json());
  }

  async readLatest(symbol: string): Promise<FundamentalReviewJobRecord | null> {
    const normalized = cleanFundamentalReviewSymbol(symbol);
    if (!normalized) throw new Error("A valid symbol is required.");
    return this.readDocument(`${this.collection}_latest/${encodeURIComponent(normalized)}`);
  }

  async listLatest(limit=200): Promise<FundamentalReviewJobRecord[]> {
    const bounded=Math.max(1,Math.min(200,Math.trunc(limit)));
    const response=await this.request(`${this.baseUrl()}/${this.collection}_latest?pageSize=${bounded}`);
    if (!response.ok) throw new Error(`Firestore publication-list read failed with HTTP ${response.status}.`);
    const payload:any=await response.json();
    // Explicitly fail rather than imply complete coverage beyond the capped beta.
    if(payload.nextPageToken)throw new Error("Publication list exceeds the capped beta page; pagination required.");
    return (Array.isArray(payload.documents)?payload.documents:[]).map(recordFromDocument).filter((item:any)=>item!==null);
  }

  async readJob(jobId: string): Promise<FundamentalReviewJobRecord | null> {
    return this.readDocument(`${this.collection}/${encodeURIComponent(safeDocumentId(jobId))}`);
  }

  async save(job: FundamentalReviewJobRecord): Promise<void> {
    if (!job.jobId) throw new Error("A durable Fundamental Review job must have a jobId.");
    const token = await this.tokenProvider();
    const jobPath = `projects/${this.projectId}/databases/${this.databaseId}/documents/${this.collection}/${safeDocumentId(job.jobId)}`;
    const latestPath = `projects/${this.projectId}/databases/${this.databaseId}/documents/${this.collection}_latest/${job.symbol}`;
    const fields = {
      payload: firestoreString(JSON.stringify(job)),
      symbol: firestoreString(job.symbol),
      status: firestoreString(job.status),
      updated_at: firestoreString(job.updatedAt),
    };
    const response = await this.fetchImpl(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/${encodeURIComponent(this.databaseId)}/documents:commit`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ writes: [
          { update: { name: jobPath, fields } },
          { update: { name: latestPath, fields } },
        ] }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) throw new Error(`Firestore write failed with HTTP ${response.status}.`);
  }
}

export function createFundamentalReviewStoreFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): FundamentalReviewStore {
  const projectId = googleCloudProjectId(environment);
  if (!projectId) throw new Error("FUNDAMENTAL_REVIEW_GCP_PROJECT or GOOGLE_CLOUD_PROJECT is not configured.");
  return new FirestoreFundamentalReviewStore({
    projectId,
    databaseId: environment.FUNDAMENTAL_REVIEW_FIRESTORE_DATABASE || "(default)",
    collection: environment.FUNDAMENTAL_REVIEW_FIRESTORE_COLLECTION || "fundamental_review_jobs_v1",
  });
}
