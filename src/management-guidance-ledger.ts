import {
  managementGuidanceDeliveryInputErrors,
  type ManagementCommentaryObservation,
  type ManagementCommitmentStatement,
  type ManagementDeliveryObservation,
  type ManagementGuidanceDeliveryInput,
} from "./management-guidance-delivery.ts";

export const MANAGEMENT_GUIDANCE_LEDGER_SCHEMA_VERSION = "1.0.0" as const;

type LedgerDocument = {
  schemaVersion: typeof MANAGEMENT_GUIDANCE_LEDGER_SCHEMA_VERSION;
  symbol: string;
  updatedAt: string;
  history: ManagementGuidanceDeliveryInput;
};

export type ManagementGuidanceLedgerReadResult =
  | { status: "available"; history: ManagementGuidanceDeliveryInput | null; generation: string | null }
  | { status: "unavailable"; reason: string };

export type ManagementGuidanceLedgerMergeResult =
  | { status: "saved"; history: ManagementGuidanceDeliveryInput; generation: string | null; attempts: number }
  | { status: "unavailable"; reason: string; attempts: number };

export interface ManagementGuidanceLedger {
  read(symbol: string): Promise<ManagementGuidanceLedgerReadResult>;
  merge(input: ManagementGuidanceDeliveryInput): Promise<ManagementGuidanceLedgerMergeResult>;
}

export class ManagementGuidanceLedgerConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagementGuidanceLedgerConflictError";
  }
}

const SYMBOL = /^[A-Z0-9&.-]{1,24}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function assertManagementGuidanceLedgerSymbol(symbol: string): void {
  if (!SYMBOL.test(symbol)) {
    throw new Error("Ledger symbol must be a canonical uppercase exchange symbol (1-24 characters).");
  }
}

export function managementGuidanceLedgerInputErrors(input: unknown): string[] {
  const errors = managementGuidanceDeliveryInputErrors(input);
  if (!input || typeof input !== "object") return errors;
  const candidate = input as Partial<ManagementGuidanceDeliveryInput>;
  if (typeof candidate.symbol === "string" && !SYMBOL.test(candidate.symbol)) {
    errors.push("symbol must already be in canonical uppercase form.");
  }
  const dates: Array<[string, unknown]> = [["asOfDate", candidate.asOfDate]];
  candidate.statements?.forEach((row, index) => {
    dates.push([`statements[${index}].statedAt`, row.statedAt]);
    if (row.targetDate !== null) dates.push([`statements[${index}].targetDate`, row.targetDate]);
  });
  candidate.commentary?.forEach((row, index) => dates.push([`commentary[${index}].observedAt`, row.observedAt]));
  candidate.delivery?.forEach((row, index) => dates.push([`delivery[${index}].assessedAt`, row.assessedAt]));
  for (const [label, value] of dates) {
    if (typeof value === "string" && ISO_DATE.test(value) && !isRealIsoDate(value)) {
      errors.push(`${label} is not a real calendar date.`);
    }
  }
  return [...new Set(errors)];
}

function assertValidInput(input: ManagementGuidanceDeliveryInput): void {
  const errors = managementGuidanceLedgerInputErrors(input);
  if (errors.length) throw new Error(`Invalid management-guidance ledger input: ${errors.join(" ")}`);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function comparable(row: Record<string, unknown>): string {
  const { evidenceRefs: _evidenceRefs, ...rest } = row;
  return JSON.stringify(Object.fromEntries(Object.entries(rest).sort(([left], [right]) => left.localeCompare(right))));
}

function mergeRows<T extends { evidenceRefs: string[] }>(
  existing: T[],
  incoming: T[],
  idFor: (row: T) => string,
  dateFor: (row: T) => string,
  collection: string,
): T[] {
  const byId = new Map(existing.map(row => [idFor(row), structuredClone(row)]));
  for (const row of incoming) {
    const id = idFor(row);
    const prior = byId.get(id);
    if (!prior) {
      byId.set(id, structuredClone(row));
      continue;
    }
    if (comparable(prior as Record<string, unknown>) !== comparable(row as Record<string, unknown>)) {
      throw new ManagementGuidanceLedgerConflictError(
        `${collection} ID ${id} already exists with different historical content; refusing to overwrite it.`,
      );
    }
    byId.set(id, { ...prior, evidenceRefs: uniqueStrings([...prior.evidenceRefs, ...row.evidenceRefs]) });
  }
  return [...byId.values()].sort((left, right) =>
    dateFor(left).localeCompare(dateFor(right)) || idFor(left).localeCompare(idFor(right)),
  );
}

export function mergeManagementGuidanceHistory(
  existing: ManagementGuidanceDeliveryInput | null,
  incoming: ManagementGuidanceDeliveryInput,
): ManagementGuidanceDeliveryInput {
  assertValidInput(incoming);
  if (!existing) return structuredClone(incoming);
  assertValidInput(existing);
  if (existing.symbol !== incoming.symbol) {
    throw new ManagementGuidanceLedgerConflictError(`Cannot merge ${incoming.symbol} into ${existing.symbol}.`);
  }
  return {
    symbol: existing.symbol,
    asOfDate: existing.asOfDate >= incoming.asOfDate ? existing.asOfDate : incoming.asOfDate,
    statements: mergeRows<ManagementCommitmentStatement>(
      existing.statements, incoming.statements, row => row.statementId, row => row.statedAt, "Statement",
    ),
    commentary: mergeRows<ManagementCommentaryObservation>(
      existing.commentary, incoming.commentary, row => row.observationId, row => row.observedAt, "Commentary observation",
    ),
    delivery: mergeRows<ManagementDeliveryObservation>(
      existing.delivery, incoming.delivery, row => row.observationId, row => row.assessedAt, "Delivery observation",
    ),
  };
}

export class InMemoryManagementGuidanceLedger implements ManagementGuidanceLedger {
  private readonly documents = new Map<string, { history: ManagementGuidanceDeliveryInput; generation: number }>();

  async read(symbol: string): Promise<ManagementGuidanceLedgerReadResult> {
    assertManagementGuidanceLedgerSymbol(symbol);
    const document = this.documents.get(symbol);
    return document
      ? { status: "available", history: structuredClone(document.history), generation: String(document.generation) }
      : { status: "available", history: null, generation: null };
  }

  async merge(input: ManagementGuidanceDeliveryInput): Promise<ManagementGuidanceLedgerMergeResult> {
    assertValidInput(input);
    const current = this.documents.get(input.symbol);
    const history = mergeManagementGuidanceHistory(current?.history ?? null, input);
    const generation = (current?.generation ?? 0) + 1;
    this.documents.set(input.symbol, { history: structuredClone(history), generation });
    return { status: "saved", history: structuredClone(history), generation: String(generation), attempts: 1 };
  }
}

type Fetch = typeof fetch;
type TokenProvider = () => Promise<string>;

export type GcsManagementGuidanceLedgerOptions = {
  bucket: string;
  prefix?: string;
  fetch?: Fetch;
  tokenProvider?: TokenProvider;
  storageApiBaseUrl?: string;
  maxWriteAttempts?: number;
  now?: () => Date;
};

const METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

function validateBucket(bucket: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)) throw new Error("Invalid Google Cloud Storage bucket name.");
}

function normalizePrefix(prefix: string | undefined): string {
  const normalized = (prefix ?? "management-guidance-ledger/v1").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.includes("..") || !/^[A-Za-z0-9/_-]+$/.test(normalized)) {
    throw new Error("Invalid management-guidance ledger object prefix.");
  }
  return normalized;
}

async function metadataToken(fetchImpl: Fetch): Promise<string> {
  const response = await fetchImpl(METADATA_TOKEN_URL, { headers: { "Metadata-Flavor": "Google" } });
  if (!response.ok) throw new Error(`Cloud Run metadata token request failed with HTTP ${response.status}.`);
  const body = await response.json() as { access_token?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) throw new Error("Cloud Run metadata response did not contain an access token.");
  return body.access_token;
}

export class GcsManagementGuidanceLedger implements ManagementGuidanceLedger {
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly fetchImpl: Fetch;
  private readonly tokenProvider: TokenProvider;
  private readonly baseUrl: string;
  private readonly maxWriteAttempts: number;
  private readonly now: () => Date;

  constructor(options: GcsManagementGuidanceLedgerOptions) {
    validateBucket(options.bucket);
    this.bucket = options.bucket;
    this.prefix = normalizePrefix(options.prefix);
    this.fetchImpl = options.fetch ?? fetch;
    this.tokenProvider = options.tokenProvider ?? (() => metadataToken(this.fetchImpl));
    this.baseUrl = (options.storageApiBaseUrl ?? "https://storage.googleapis.com").replace(/\/$/, "");
    this.maxWriteAttempts = options.maxWriteAttempts ?? 3;
    if (!Number.isInteger(this.maxWriteAttempts) || this.maxWriteAttempts < 1 || this.maxWriteAttempts > 10) {
      throw new Error("maxWriteAttempts must be an integer between 1 and 10.");
    }
    this.now = options.now ?? (() => new Date());
  }

  private objectName(symbol: string): string {
    return `${this.prefix}/${symbol}.json`;
  }

  private metadataUrl(symbol: string): string {
    return `${this.baseUrl}/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(this.objectName(symbol))}`;
  }

  private async token(): Promise<string> {
    return this.tokenProvider();
  }

  async read(symbol: string): Promise<ManagementGuidanceLedgerReadResult> {
    assertManagementGuidanceLedgerSymbol(symbol);
    try {
      const authorization = `Bearer ${await this.token()}`;
      const metadataResponse = await this.fetchImpl(this.metadataUrl(symbol), { headers: { authorization } });
      if (metadataResponse.status === 404) return { status: "available", history: null, generation: null };
      if (!metadataResponse.ok) return { status: "unavailable", reason: `GCS metadata read failed with HTTP ${metadataResponse.status}.` };
      const metadata = await metadataResponse.json() as { generation?: unknown };
      if (typeof metadata.generation !== "string" || !/^\d+$/.test(metadata.generation)) {
        return { status: "unavailable", reason: "GCS object metadata did not include a valid generation." };
      }
      const contentResponse = await this.fetchImpl(`${this.metadataUrl(symbol)}?alt=media`, { headers: { authorization } });
      if (!contentResponse.ok) return { status: "unavailable", reason: `GCS content read failed with HTTP ${contentResponse.status}.` };
      const document = await contentResponse.json() as Partial<LedgerDocument>;
      if (document.schemaVersion !== MANAGEMENT_GUIDANCE_LEDGER_SCHEMA_VERSION || document.symbol !== symbol || !document.history) {
        return { status: "unavailable", reason: "GCS ledger object has an unsupported or malformed schema." };
      }
      const errors = managementGuidanceLedgerInputErrors(document.history);
      if (errors.length || document.history.symbol !== symbol) {
        return { status: "unavailable", reason: `GCS ledger history is invalid: ${errors.join(" ") || "symbol mismatch"}.` };
      }
      return { status: "available", history: structuredClone(document.history), generation: metadata.generation };
    } catch (error) {
      return { status: "unavailable", reason: error instanceof Error ? error.message : "Unknown ledger read failure." };
    }
  }

  private async write(
    history: ManagementGuidanceDeliveryInput,
    expectedGeneration: string | null,
  ): Promise<{ status: "saved"; generation: string | null } | { status: "conflict" } | { status: "unavailable"; reason: string }> {
    try {
      const token = await this.token();
      const params = new URLSearchParams({
        uploadType: "media",
        name: this.objectName(history.symbol),
        ifGenerationMatch: expectedGeneration ?? "0",
      });
      const document: LedgerDocument = {
        schemaVersion: MANAGEMENT_GUIDANCE_LEDGER_SCHEMA_VERSION,
        symbol: history.symbol,
        updatedAt: this.now().toISOString(),
        history,
      };
      const response = await this.fetchImpl(
        `${this.baseUrl}/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?${params.toString()}`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify(document),
        },
      );
      if (response.status === 412) return { status: "conflict" };
      if (!response.ok) return { status: "unavailable", reason: `GCS conditional write failed with HTTP ${response.status}.` };
      const metadata = await response.json().catch(() => ({})) as { generation?: unknown };
      return { status: "saved", generation: typeof metadata.generation === "string" ? metadata.generation : null };
    } catch (error) {
      return { status: "unavailable", reason: error instanceof Error ? error.message : "Unknown ledger write failure." };
    }
  }

  async merge(input: ManagementGuidanceDeliveryInput): Promise<ManagementGuidanceLedgerMergeResult> {
    assertValidInput(input);
    for (let attempt = 1; attempt <= this.maxWriteAttempts; attempt += 1) {
      const current = await this.read(input.symbol);
      if (current.status === "unavailable") return { ...current, attempts: attempt };
      const history = mergeManagementGuidanceHistory(current.history, input);
      const written = await this.write(history, current.generation);
      if (written.status === "saved") return { ...written, history, attempts: attempt };
      if (written.status === "unavailable") return { ...written, attempts: attempt };
    }
    return { status: "unavailable", reason: `GCS ledger remained contested after ${this.maxWriteAttempts} conditional-write attempts.`, attempts: this.maxWriteAttempts };
  }
}

export class UnavailableManagementGuidanceLedger implements ManagementGuidanceLedger {
  constructor(private readonly reason: string) {}
  async read(symbol: string): Promise<ManagementGuidanceLedgerReadResult> {
    assertManagementGuidanceLedgerSymbol(symbol);
    return { status: "unavailable", reason: this.reason };
  }
  async merge(input: ManagementGuidanceDeliveryInput): Promise<ManagementGuidanceLedgerMergeResult> {
    assertValidInput(input);
    return { status: "unavailable", reason: this.reason, attempts: 0 };
  }
}

export function createManagementGuidanceLedgerFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ManagementGuidanceLedger {
  const bucket = environment.MANAGEMENT_GUIDANCE_LEDGER_BUCKET?.trim();
  if (!bucket) return new UnavailableManagementGuidanceLedger("MANAGEMENT_GUIDANCE_LEDGER_BUCKET is not configured.");
  return new GcsManagementGuidanceLedger({
    bucket,
    prefix: environment.MANAGEMENT_GUIDANCE_LEDGER_PREFIX?.trim() || undefined,
  });
}
