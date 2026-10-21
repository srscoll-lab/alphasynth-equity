type JsonObject = Record<string, unknown>;

export type TapetideFcsSource = {
  uri: string;
  title: string;
  publishedAt: string | null;
  providerTool: "get_stock_events" | "list_company_documents";
};

export type TapetideFcsDiscovery = {
  configured: boolean;
  sources: TapetideFcsSource[];
  diagnostics: Array<{ outcome: string; tool?: string; detail?: string }>;
};

export type TapetideFinancialCandidate = {
  metricId: "revenue" | "operating_profit" | "operating_margin" | "net_profit";
  providerLabel: string;
  previousPeriod: string;
  previousPeriodEnd: string;
  previousValue: number;
  currentPeriod: string;
  currentPeriodEnd: string;
  currentValue: number;
  unit: "percent" | "provider_reported_scale";
  previousAvailableAt: string | null;
  currentAvailableAt: string | null;
  verificationStatus: "candidate_only";
};

export type TapetideFinancialSnapshot = {
  configured: boolean;
  symbol: string;
  candidates: TapetideFinancialCandidate[];
  rawPeriodCount: number;
  diagnostics: Array<{ outcome: string; tool?: string; detail?: string }>;
};

type TapetideClientOptions = {
  endpoint?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_ENDPOINT = "https://mcp.tapetide.com/mcp";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const EXCHANGE_DOMAINS = ["nseindia.com", "nsearchives.nseindia.com", "bseindia.com"];

const validHttpsUrl = (value: unknown): string | null => {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
};

const hostnameAllowed = (raw: string, issuerDomains: readonly string[]) => {
  const host = new URL(raw).hostname.toLowerCase();
  return [...EXCHANGE_DOMAINS, ...issuerDomains].some((domain) => {
    const normalized = domain.trim().toLowerCase();
    return normalized && (host === normalized || host.endsWith(`.${normalized}`));
  });
};

const isoDate = (value: unknown): string | null => {
  const text = String(value || "").trim();
  const match = text.match(/^(20\d{2}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

function parseMcpPayload(text: string): any {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty_mcp_response");
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const messages = [...trimmed.matchAll(/^data:\s*(.+)$/gm)]
    .map((match) => match[1].trim()).filter(Boolean).map((item) => JSON.parse(item));
  if (!messages.length) throw new Error("invalid_mcp_response");
  return messages.find((message) => message?.result || message?.error) || messages.at(-1);
}

function toolPayload(result: any): unknown {
  if (result?.structuredContent !== undefined) return result.structuredContent;
  if (result?.result?.structuredContent !== undefined) return result.result.structuredContent;
  const content = result?.content ?? result?.result?.content;
  if (!Array.isArray(content)) return result?.result ?? result;
  const texts = content.filter((item: any) => item?.type === "text" && typeof item.text === "string").map((item: any) => item.text);
  for (const text of texts) {
    try { return JSON.parse(text); } catch { /* Preserve the text below. */ }
  }
  return texts.join("\n");
}

function collectSourceObjects(value: unknown, output: JsonObject[] = [], depth = 0): JsonObject[] {
  if (depth > 12 || value == null) return output;
  if (Array.isArray(value)) {
    for (const item of value) collectSourceObjects(item, output, depth + 1);
    return output;
  }
  if (typeof value !== "object") return output;
  const object = value as JsonObject;
  if (Object.entries(object).some(([key, child]) => /(?:url|uri|link|pdf)/i.test(key) && typeof child === "string" && /^https:\/\//i.test(child))) output.push(object);
  for (const child of Object.values(object)) collectSourceObjects(child, output, depth + 1);
  return output;
}

function sourcesFromPayload(payload: unknown, providerTool: TapetideFcsSource["providerTool"], issuerDomains: readonly string[]): TapetideFcsSource[] {
  const sources: TapetideFcsSource[] = [];
  for (const object of collectSourceObjects(payload)) {
    const rawUrl = object.pdf_url ?? object.pdfUrl ?? object.source_url ?? object.sourceUrl ?? object.url ?? object.uri ?? object.link;
    const uri = validHttpsUrl(rawUrl);
    if (!uri || !hostnameAllowed(uri, issuerDomains)) continue;
    const title = String(object.title ?? object.name ?? object.subject ?? object.document_type ?? object.type ?? "Official company filing").trim().slice(0, 240);
    const publishedAt = isoDate(object.published_at ?? object.publishedAt ?? object.filing_date ?? object.filingDate ?? object.date);
    sources.push({ uri, title: title || "Official company filing", publishedAt, providerTool });
  }
  return sources.filter((source, index, all) => all.findIndex((candidate) => candidate.uri === source.uri) === index);
}

function fcsSourcePriority(source: TapetideFcsSource): number {
  let pathname = "";
  try { pathname = decodeURIComponent(new URL(source.uri).pathname); } catch { /* URL was already validated. */ }
  const text = `${source.title} ${pathname}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  let score = source.providerTool === "list_company_documents" ? 25 : 0;
  if (/\b(?:quarterly|financial) results?\b|\bresults? for the quarter\b|\bquarter ended\b/.test(text)) score += 600;
  if (/\b(?:outcome of (?:the )?board meeting|board meeting outcome)\b/.test(text)) score += 520;
  if (/\b(?:investor|earnings|results?) presentation\b|\bpresentation\b/.test(text)) score += 460;
  if (/\bpress release\b/.test(text)) score += 400;
  if (/\bannual report\b/.test(text)) score += 350;
  if (/\b(?:earnings call|concall|conference call|transcript)\b/.test(text)) score += 300;
  if (/\b(?:trading window|shareholders? meeting|scrutini[sz]er|newspaper publication|record date)\b/.test(text)) score -= 350;
  if (/\b(?:bagging|receiving) of orders?\b|\border contracts?\b/.test(text)) score -= 120;
  return score;
}

export class TapetideMcpClient {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private sessionId = "";
  private requestId = 0;

  constructor(options: TapetideClientOptions = {}) {
    this.endpoint = options.endpoint || process.env.TAPETIDE_MCP_URL || DEFAULT_ENDPOINT;
    this.token = options.token || process.env.TAPETIDE_TOKEN || "";
    this.fetchImpl = options.fetchImpl || fetch;
    this.timeoutMs = Math.max(2_000, Math.min(options.timeoutMs || 20_000, 60_000));
  }

  configured() { return Boolean(this.token && validHttpsUrl(this.endpoint)); }

  private async post(body: unknown): Promise<any> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`tapetide_http_${response.status}`);
    this.sessionId ||= response.headers.get("mcp-session-id") || "";
    const text = await response.text();
    return text.trim() ? parseMcpPayload(text) : {};
  }

  private async initialize() {
    if (this.sessionId) return;
    const response = await this.post({
      jsonrpc: "2.0",
      id: ++this.requestId,
      method: "initialize",
      params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "alphasynth-fcs", version: "1.0.0" } },
    });
    if (response?.error) throw new Error(`tapetide_initialize_${response.error.code || "failed"}`);
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  async callTool(name: string, args: JsonObject): Promise<unknown> {
    await this.initialize();
    const response = await this.post({ jsonrpc: "2.0", id: ++this.requestId, method: "tools/call", params: { name, arguments: args } });
    if (response?.error) throw new Error(`tapetide_tool_${name}_${response.error.code || "failed"}`);
    return toolPayload(response?.result ?? response);
  }
}

const FINANCIAL_METRICS: Array<{ metricId: TapetideFinancialCandidate["metricId"]; aliases: RegExp[] }> = [
  { metricId: "revenue", aliases: [/^sales$/i, /^revenue(?: from operations)?$/i, /^total income$/i] },
  { metricId: "operating_profit", aliases: [/^operating profit$/i, /^ebitda$/i] },
  { metricId: "operating_margin", aliases: [/^opm\s*%?$/i, /^operating (?:profit )?margin\s*%?$/i, /^ebitda margin\s*%?$/i] },
  { metricId: "net_profit", aliases: [/^net profit$/i, /^profit after tax$/i, /^pat$/i] },
];

const periodEnd = (value: unknown): string | null => {
  const text = String(value || "").trim();
  const exact = text.match(/^(20\d{2})-(03-31|06-30|09-30|12-31)$/);
  if (exact) return exact[0];
  const named = text.match(/^(Mar|Jun|Sep|Dec)[a-z]*[\s-]+(20\d{2})$/i);
  if (!named) return null;
  const monthEnd: Record<string, string> = { mar: "03-31", jun: "06-30", sep: "09-30", dec: "12-31" };
  return `${named[2]}-${monthEnd[named[1].slice(0, 3).toLowerCase()]}`;
};

const finiteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").replace(/,/g, "").replace(/%/g, "").trim();
  if (!text || text === "-" || text === "—") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

export type FinancialObservation = { label: string; period: string; periodEnd: string; value: number; availableAt: string | null };

export function financialMetric(label: string) {
  const normalized = label.trim().replace(/\s+/g, " ");
  return FINANCIAL_METRICS.find((metric) => metric.aliases.some((alias) => alias.test(normalized)))?.metricId ?? null;
}

/**
 * Tapetide has returned more than one JSON envelope over time. This reader is
 * deliberately structural: it accepts labelled row arrays and period/value
 * observations, but only for the four explicitly registered labels above.
 */
export function financialObservationsFromPayload(payload: unknown): FinancialObservation[] {
  const observations: FinancialObservation[] = [];
  const seen = new Set<string>();
  const append = (label: unknown, period: unknown, value: unknown, availableAt: unknown) => {
    const metricLabel = String(label || "").trim();
    if (!financialMetric(metricLabel)) return;
    const end = periodEnd(period);
    const number = finiteNumber(value);
    if (!end || number === null) return;
    const availability = isoDate(availableAt);
    const key = `${metricLabel.toLowerCase()}|${end}`;
    if (seen.has(key)) return;
    seen.add(key);
    observations.push({ label: metricLabel, period: String(period).trim(), periodEnd: end, value: number, availableAt: availability });
  };
  const visit = (value: unknown, depth = 0) => {
    if (depth > 12 || value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    const object = value as JsonObject;
    const label = object.label ?? object.name ?? object.metric ?? object.item ?? object.line_item;
    const directPeriod = object.period ?? object.period_label ?? object.quarter ?? object.date;
    const directValue = object.value ?? object.amount;
    if (label && directPeriod && directValue !== undefined) {
      append(label, directPeriod, directValue, object.available_at ?? object.availability_date ?? object.published_at);
    }
    const periods = [object.periods, object.columns, object.dates, object.period_labels]
      .find((candidate) => Array.isArray(candidate) && candidate.some((item) => periodEnd(item))) as unknown[] | undefined;
    const values = [object.values, object.data, object.amounts]
      .find((candidate) => Array.isArray(candidate)) as unknown[] | undefined;
    const availability = [object.availability_dates, object.available_at, object.published_dates]
      .find((candidate) => Array.isArray(candidate)) as unknown[] | undefined;
    const availabilityByPeriod = new Map<string, unknown>();
    if (Array.isArray(object.availability)) {
      for (const item of object.availability) {
        if (!item || typeof item !== "object") continue;
        const record = item as JsonObject;
        availabilityByPeriod.set(String(record.period || "").trim(), record.available_from ?? record.available_at ?? record.published_at);
      }
    }
    if (label && periods && values) periods.forEach((period, index) => append(label, period, values[index], availability?.[index]));
    if (periods) {
      const rowCollections = [object.rows, object.items, object.metrics].filter(Array.isArray) as JsonObject[][];
      for (const rows of rowCollections) {
        for (const row of rows) {
          const rowLabel = row.label ?? row.name ?? row.metric ?? row.item ?? row.line_item;
          const rowValues = [row.values, row.data, row.amounts].find(Array.isArray) as unknown[] | undefined;
          const rowAvailability = [row.availability_dates, row.available_at, row.published_dates]
            .find(Array.isArray) as unknown[] | undefined;
          if (!rowLabel || !rowValues) continue;
          periods.forEach((period, index) => append(rowLabel, period, rowValues[index], rowAvailability?.[index] ?? availability?.[index]));
        }
      }
      for (const [rowLabel, rowValues] of Object.entries(object)) {
        if (!financialMetric(rowLabel) || !Array.isArray(rowValues)) continue;
        periods.forEach((period, index) => append(rowLabel, period, rowValues[index], availability?.[index]));
      }
      const keyedRows = object.data && typeof object.data === "object" && !Array.isArray(object.data)
        ? object.data as JsonObject : null;
      if (keyedRows) {
        for (const [rowLabel, periodValues] of Object.entries(keyedRows)) {
          if (!financialMetric(rowLabel) || !periodValues || typeof periodValues !== "object" || Array.isArray(periodValues)) continue;
          const valueMap = periodValues as JsonObject;
          periods.forEach((period, index) => append(rowLabel, period, valueMap[String(period)],
            availabilityByPeriod.get(String(period)) ?? availability?.[index]));
        }
      }
    }
    for (const child of Object.values(object)) visit(child, depth + 1);
  };
  visit(payload);
  return observations.sort((left, right) => left.periodEnd.localeCompare(right.periodEnd) || left.label.localeCompare(right.label));
}

/** Provider values are candidate hints only; this function never creates FCS evidence rows. */
export async function fetchTapetideFinancialCandidates(input: {
  symbol: string;
  cutoff: string;
  fetchImpl?: typeof fetch;
}): Promise<TapetideFinancialSnapshot> {
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const client = new TapetideMcpClient({ fetchImpl: input.fetchImpl });
  if (!client.configured()) return { configured: false, symbol, candidates: [], rawPeriodCount: 0, diagnostics: [{ outcome: "tapetide_not_configured" }] };
  try {
    // Request a single frequency explicitly; the default can include annual tables.
    const payload = await client.callTool("get_financials", { symbol, section: "quarterly", periods: 8 });
    const observations = financialObservationsFromPayload(payload)
      .filter((item) => (!item.availableAt || item.availableAt <= input.cutoff) && item.periodEnd <= input.cutoff);
    const periods = [...new Set(observations.map((item) => item.periodEnd))].sort();
    const latest = periods.at(-1) || "";
    const priorYear = latest ? `${Number(latest.slice(0, 4)) - 1}${latest.slice(4)}` : "";
    const candidates: TapetideFinancialCandidate[] = [];
    for (const definition of FINANCIAL_METRICS) {
      const current = observations.find((item) => item.periodEnd === latest && financialMetric(item.label) === definition.metricId);
      const previous = observations.find((item) => item.periodEnd === priorYear && financialMetric(item.label) === definition.metricId);
      if (!current || !previous) continue;
      candidates.push({
        metricId: definition.metricId,
        providerLabel: current.label,
        previousPeriod: previous.period,
        previousPeriodEnd: previous.periodEnd,
        previousValue: previous.value,
        currentPeriod: current.period,
        currentPeriodEnd: current.periodEnd,
        currentValue: current.value,
        unit: definition.metricId === "operating_margin" ? "percent" : "provider_reported_scale",
        previousAvailableAt: previous.availableAt,
        currentAvailableAt: current.availableAt,
        verificationStatus: "candidate_only",
      });
    }
    return {
      configured: true,
      symbol,
      candidates,
      rawPeriodCount: periods.length,
      diagnostics: [{ outcome: candidates.length ? "tapetide_financial_candidates_ready" : "tapetide_financial_candidates_incomplete", tool: "get_financials", detail: `${candidates.length} same-quarter candidate comparisons; official verification required` }],
    };
  } catch (error) {
    return { configured: true, symbol, candidates: [], rawPeriodCount: 0, diagnostics: [{ outcome: "tapetide_tool_failed", tool: "get_financials", detail: error instanceof Error ? error.message : String(error) }] };
  }
}

export type TapetideQuarterlyFinancials = {
  configured: boolean;
  symbol: string;
  /** Exact bytes of the provider response, retained so the snapshot can be archived and hashed. */
  payloadBytes: Buffer | null;
  observations: FinancialObservation[];
  diagnostics: Array<{ outcome: string; tool?: string; detail?: string }>;
};

/** One quarterly get_financials call; observations are not filtered by cutoff here. */
export async function fetchTapetideQuarterlyFinancials(input: {
  symbol: string;
  fetchImpl?: typeof fetch;
}): Promise<TapetideQuarterlyFinancials> {
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const client = new TapetideMcpClient({ fetchImpl: input.fetchImpl });
  if (!client.configured()) return { configured: false, symbol, payloadBytes: null, observations: [], diagnostics: [{ outcome: "tapetide_not_configured" }] };
  try {
    const payload = await client.callTool("get_financials", { symbol, section: "quarterly", periods: 8 });
    const observations = financialObservationsFromPayload(payload);
    return {
      configured: true,
      symbol,
      payloadBytes: Buffer.from(JSON.stringify({ tool: "get_financials", symbol, section: "quarterly", periods: 8, payload }), "utf-8"),
      observations,
      diagnostics: [{ outcome: "tapetide_tool_completed", tool: "get_financials", detail: `${observations.length} registered quarterly observations` }],
    };
  } catch (error) {
    return { configured: true, symbol, payloadBytes: null, observations: [], diagnostics: [{ outcome: "tapetide_tool_failed", tool: "get_financials", detail: error instanceof Error ? error.message : String(error) }] };
  }
}

export function tapetideFcsConfigured(): boolean {
  return new TapetideMcpClient().configured();
}

/** Tapetide discovers links; only original trusted filings may become evidence. */
export async function discoverTapetideFcsSources(input: {
  symbol: string;
  issuerDomains: readonly string[];
  cutoff: string;
  fetchImpl?: typeof fetch;
}): Promise<TapetideFcsDiscovery> {
  const client = new TapetideMcpClient({ fetchImpl: input.fetchImpl });
  if (!client.configured()) return { configured: false, sources: [], diagnostics: [{ outcome: "tapetide_not_configured" }] };
  const diagnostics: TapetideFcsDiscovery["diagnostics"] = [];
  const sources: TapetideFcsSource[] = [];
  const calls: Array<{ name: TapetideFcsSource["providerTool"]; args: JsonObject }> = [
    { name: "get_stock_events", args: { symbol: input.symbol, type: "filings", limit: 50 } },
    { name: "list_company_documents", args: { symbol: input.symbol } },
  ];
  for (const call of calls) {
    try {
      const payload = await client.callTool(call.name, call.args);
      const admitted = sourcesFromPayload(payload, call.name, input.issuerDomains)
        .filter((source) => !source.publishedAt || source.publishedAt <= input.cutoff);
      sources.push(...admitted);
      diagnostics.push({ outcome: "tapetide_tool_completed", tool: call.name, detail: `${admitted.length} trusted official links admitted` });
    } catch (error) {
      diagnostics.push({ outcome: "tapetide_tool_failed", tool: call.name, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  const uniqueSources = sources
    .filter((source, index, all) => all.findIndex((candidate) => candidate.uri === source.uri) === index)
    .sort((left, right) => fcsSourcePriority(right) - fcsSourcePriority(left)
      || String(right.publishedAt || "").localeCompare(String(left.publishedAt || ""))
      || left.uri.localeCompare(right.uri));
  return {
    configured: true,
    // Provider event feeds are chronological and often start with routine
    // notices. Rank financial-result documents before applying the cap so the
    // downstream six-document reader is not exhausted by AGM/trading-window
    // filings while a quarterly result is present later in the same response.
    sources: uniqueSources.slice(0, 24),
    diagnostics,
  };
}
