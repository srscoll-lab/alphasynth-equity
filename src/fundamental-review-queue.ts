import { createGoogleAccessTokenProvider, googleCloudProjectId } from "./google-cloud-runtime.ts";

type Fetch = typeof fetch;

export type FundamentalReviewTask = { jobId: string; symbol: string };

export interface FundamentalReviewQueue {
  enqueue(task: FundamentalReviewTask): Promise<void>;
}

export class InMemoryFundamentalReviewQueue implements FundamentalReviewQueue {
  readonly tasks: FundamentalReviewTask[] = [];
  async enqueue(task: FundamentalReviewTask): Promise<void> {
    this.tasks.push(structuredClone(task));
  }
}

type CloudTasksOptions = {
  projectId: string;
  location: string;
  queue: string;
  workerUrl: string;
  serviceAccountEmail: string;
  audience?: string;
  internalToken?: string;
  fetch?: Fetch;
  tokenProvider?: () => Promise<string>;
};

export class CloudTasksFundamentalReviewQueue implements FundamentalReviewQueue {
  private readonly options: CloudTasksOptions;
  private readonly fetchImpl: Fetch;
  private readonly tokenProvider: () => Promise<string>;

  constructor(options: CloudTasksOptions) {
    this.options = options;
    this.fetchImpl = options.fetch ?? fetch;
    this.tokenProvider = options.tokenProvider ?? createGoogleAccessTokenProvider({ fetch: this.fetchImpl });
    if (!options.projectId || !options.location || !options.queue || !/^https:\/\//.test(options.workerUrl) || !options.serviceAccountEmail) {
      throw new Error("Cloud Tasks Fundamental Review configuration is incomplete.");
    }
  }

  async enqueue(task: FundamentalReviewTask): Promise<void> {
    const parent = `projects/${this.options.projectId}/locations/${this.options.location}/queues/${this.options.queue}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.options.internalToken) headers["x-fundamental-review-token"] = this.options.internalToken;
    const response = await this.fetchImpl(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.tokenProvider()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ task: { dispatchDeadline: "900s", httpRequest: {
        httpMethod: "POST",
        url: this.options.workerUrl,
        headers,
        body: Buffer.from(JSON.stringify(task)).toString("base64"),
        oidcToken: {
          serviceAccountEmail: this.options.serviceAccountEmail,
          audience: this.options.audience || this.options.workerUrl,
        },
      } } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Cloud Tasks enqueue failed with HTTP ${response.status}.`);
  }
}

export function createFundamentalReviewQueueFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): FundamentalReviewQueue {
  return new CloudTasksFundamentalReviewQueue({
    projectId: googleCloudProjectId(environment),
    location: String(environment.FUNDAMENTAL_REVIEW_TASKS_LOCATION || "").trim(),
    queue: String(environment.FUNDAMENTAL_REVIEW_TASKS_QUEUE || "").trim(),
    workerUrl: String(environment.FUNDAMENTAL_REVIEW_WORKER_URL || "").trim(),
    serviceAccountEmail: String(environment.FUNDAMENTAL_REVIEW_TASKS_SERVICE_ACCOUNT || "").trim(),
    audience: String(environment.FUNDAMENTAL_REVIEW_WORKER_AUDIENCE || "").trim() || undefined,
    internalToken: String(environment.FUNDAMENTAL_REVIEW_INTERNAL_TOKEN || "").trim() || undefined,
  });
}
