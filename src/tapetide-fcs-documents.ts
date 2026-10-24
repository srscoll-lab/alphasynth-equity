import { createHash } from "node:crypto";
import { containsReportedNumber, containsReportingPeriod, sourceLabelVariants } from "./fundamental-review-source-match.ts";
import { normalizeComparisonBasis } from "./fcs-comparison-basis.ts";
import { normalizeFcsUnit } from "./fcs-evidence-normalization.ts";
import { fiscalQuarterLabel, PROVIDER_CONSOLIDATION_BASIS } from "./tapetide-fcs-evidence.ts";
import { canonicalUnitSpelling, sameSegment } from "./fcs-segment-alignment.ts";
import { ADDITIVE_EXECUTION_METRICS, countScale, DERIVATION_METHOD, derivationAcceptable, deriveFourthQuarter, describeSide,
  growthUncertaintyPp, printedHalfWidth, printedSide, type PrintedComponent } from "./fcs-derived-quarter.ts";

/**
 * Execution from company documents already parsed by Tapetide (investor
 * presentations, concall transcripts; `read_document` text with
 * <!-- page N --> markers). Owner decision (21 Oct 2026, beta): accepted as a
 * secondary source, labelled "not cross-verified with NSE/BSE". The model only
 * proposes rows; a row is kept only when both values and both periods sit
 * beside its label in that same parsed text, and the page is recorded.
 */
export const DOCUMENT_SOURCE_TYPE = "tapetide_parsed_company_document";
export const DOCUMENT_DISCLOSURE = "Company document text parsed by Tapetide. Not cross-verified with NSE/BSE filings.";
const RESULTS_WINDOW_DAYS = 100;
const MAX_READS = 3;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export type TapetideDocument = { doc_id: number; doc_type: string; period: string; date?: string; num_pages?: number; pdf_url?: string; markdown_url?: string };
/** Plain HTTP download of a parsed document's full Markdown (not a plan tool call); null on any failure. */
export type FetchText = (url: string) => Promise<string | null>;
export type ExtractedRow = { metricName: string; previousPeriod: string; currentPeriod: string; previousPeriodEndDate: string;
  currentPeriodEndDate: string; previousValue: number; currentValue: number; unit: string; previousUnit?: string; quotedLabel: string; comparisonBasis: string };
export type CallTool = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export type ExtractRows = (input: { text: string; targetPeriodEnd: string; docType: string; metrics: Array<{ metric: string; units: string[] }>;
  /** Printed row label the current quarter used, so earlier quarters report the same row. */
  labelHints?: string[] }) => Promise<ExtractedRow[]>;

/**
 * Counts are printed with the counted noun ("332,940 motorcycles"). Map such
 * nouns to the registered count unit; values are never changed.
 */
const VEHICLE_NOUNS = /^(?:motor ?cycles?|bikes?|scooters?|cars?|passenger vehicles?|tractors?|trucks?|buses|bus|two[- ]wheelers?|three[- ]wheelers?|commercial vehicles?|cvs?|evs?)$/i;
const GENERIC_COUNT_NOUNS = /^(?:nos\.?|numbers?|pieces?|pcs\.?|count)$/i;
export function documentCountUnit(raw: string, allowed: readonly string[]): string {
  const unit = String(raw || "").trim();
  // One count unit per metric, so "motorcycles" one quarter and "units" the next stay comparable.
  if (/^(?:vehicles?|units?)$/i.test(unit) || VEHICLE_NOUNS.test(unit) || GENERIC_COUNT_NOUNS.test(unit)) {
    if (allowed.includes("units")) return "units";
    if (allowed.includes("vehicles")) return "vehicles";
  }
  return unit;
}

/** Parsed Markdown starts with "<!-- page 1 -->"; only real HTML/login pages are rejected. */
export function isUsableMarkdown(text: string | null | undefined): boolean {
  return typeof text === "string" && text.length > 200 && !/^\s*<(?:!doctype|html|head|body)\b/i.test(text);
}

/** "May 2026" or an ISO date → ISO date (first of month for a bare month). */
export function documentDate(doc: { date?: string; period?: string }): string | null {
  const iso = String(doc.date || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const named = String(doc.period || "").trim().match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/);
  const month = named ? MONTHS.indexOf(named[1].toLowerCase()) : -1;
  return month >= 0 ? `${named![2]}-${String(month + 1).padStart(2, "0")}-01` : null;
}

export function documentsFromListing(payload: unknown): TapetideDocument[] {
  const root: any = payload && typeof payload === "object" ? payload : {};
  const list = root.data?.documents ?? root.documents ?? root.data ?? [];
  return (Array.isArray(list) ? list : []).flatMap((item: any) => {
    const id = Number(item?.doc_id);
    if (!Number.isInteger(id) || id <= 0) return [];   // listed but not parsed / not readable on this plan
    const links = item.links || {};
    const https = (u: unknown) => typeof u === "string" && /^https:\/\//i.test(u);
    const pdf = [links.pdf_url, links.pdf, links.raw_pdf, item.pdf_url, item.source_url, item.url].find(https);
    const markdown = [links.markdown_url, links.markdown, item.markdown_url].find(https);
    if (item.has_markdown === false) return [];
    return [{ doc_id: id, doc_type: String(item.doc_type || item.type || ""), period: String(item.period || ""),
      date: item.doc_date || item.date || item.filing_date, num_pages: Number(item.num_pages) || undefined, pdf_url: pdf, markdown_url: markdown }];
  });
}

/**
 * Documents published in the target quarter's results window, presentations
 * before concalls, each ordered by closeness to quarter end + 45 days (the
 * SEBI results deadline), so the results call outranks a later AGM/analyst meet.
 */
export function resultsWindowDocuments(docs: TapetideDocument[], targetPeriodEnd: string, cutoff: string): TapetideDocument[] {
  const start = Date.parse(`${targetPeriodEnd}T00:00:00Z`);
  const end = start + RESULTS_WINDOW_DAYS * 86_400_000;
  const typical = start + 45 * 86_400_000;
  const rank = (doc: TapetideDocument) => /presentation/i.test(doc.doc_type) ? 0 : /concall/i.test(doc.doc_type) ? 1 : 9;
  const distance = (doc: TapetideDocument) => Math.abs(Date.parse(`${documentDate(doc)}T00:00:00Z`) - typical);
  return docs.filter((doc) => {
    const date = documentDate(doc);
    if (!date || rank(doc) > 1 || date > cutoff) return false;
    // A bare month ("Aug 2026") counts if any day of it falls inside the window.
    const time = Date.parse(`${date}T00:00:00Z`), monthEnd = doc.date ? time : time + 31 * 86_400_000;
    return monthEnd > start && time <= end;
  }).sort((a, b) => rank(a) - rank(b) || distance(a) - distance(b));
}

export function textFromReadDocument(payload: unknown): { text: string; nextPages: string | null } {
  if (typeof payload === "string") return { text: payload, nextPages: null };
  const root: any = payload && typeof payload === "object" ? payload : {};
  const data = root.data ?? root;
  const pages = Array.isArray(data.pages) ? data.pages.map((page: any) => page?.markdown ?? page?.text ?? "").filter(Boolean).join("\n") : "";
  const text = [data.markdown, data.text, data.content, pages].find((value) => typeof value === "string" && value) ?? "";
  const next = data.next_pages ?? root.next_pages;
  return { text, nextPages: typeof next === "string" && next ? next : null };
}

/** Page number from the last "<!-- page N -->" marker before an index. */
export function pageAt(text: string, index: number): number | null {
  let page: number | null = null;
  for (const match of text.slice(0, index).matchAll(/<!--\s*page\s+(\d+)\s*-->/gi)) page = Number(match[1]);
  return page;
}

/**
 * Spoken transcripts say "Q1 of FY26" or "first quarter of FY27"; treat these
 * as "Q1 FY26" / "Q1 FY27" on both sides. Only period wording is normalised;
 * values must still match exactly.
 */
export function normalisePeriodWording(value: string): string {
  return value.toLowerCase()
    .replace(/\b(first|second|third|fourth)\s+quarter\b/g, (_m, n: string) => `q${["first", "second", "third", "fourth"].indexOf(n) + 1}`)
    .replace(/\b([1-4])(?:st|nd|rd|th)\s+quarter\b/g, "q$1")                       // "4th Quarter" → "q4"
    .replace(/\b(q[1-4])\s+of\s+(the\s+)?/g, "$1 ")
    .replace(/\bfy\s*'?\s*(?:20)?(\d{2})\s*-\s*(?:20)?(\d{2})\b/g, "fy$2")          // "FY 26-27", "FY 2025-26" → "fy27", "fy26"
    .replace(/\b(?:fy|financial year|fiscal year|fiscal)\s*'?\s*20(\d{2})\b/g, "fy$1");   // "FY 2026", "financial year 2026" → "fy26"
}

/**
 * Period wording that names no year ("During the quarter", "last quarter of last year") is
 * only accepted when the quarter's own identity ("Q1 FY27", or its end date) is printed nearby.
 * TVS (24 Oct): rounded spoken figures "70,000 → 130,000" passed on wording copied verbatim.
 */
const EXPLICIT_PERIOD = /\bfy\s*'?\d{2}\b|\b20\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*['’-]?\s*\d{2}\b|\d{1,2}[-./]\d{1,2}[-./]\d{2,4}/;
function periodIdentified(window: string, period: string, end: string): boolean {
  if (!containsReportingPeriod(window, period, end)) return false;
  if (EXPLICIT_PERIOD.test(period) || !/^\d{4}-\d{2}-\d{2}$/.test(end || "")) return true;
  return containsReportingPeriod(window, normalisePeriodWording(fiscalQuarterLabel(end)), end);
}

/** Same rule as the official checker's text path: label, both values within 350 chars, both periods within 3000. */
export function textSupportsComparison(text: string, check: { labels: string[]; previousValue: number; currentValue: number;
  previousPeriod: string; previousEnd: string; currentPeriod: string; currentEnd: string }): { ok: boolean; page: number | null } {
  const flat = text.replace(/\s+/g, " ");
  const lower = flat.toLowerCase();
  check ={ ...check, previousPeriod: normalisePeriodWording(check.previousPeriod), currentPeriod: normalisePeriodWording(check.currentPeriod) };
  for (const label of check.labels.filter(Boolean)) {
    for (let i = lower.indexOf(label); i >= 0; i = lower.indexOf(label, i + label.length)) {
      if (/[a-z0-9]/.test(lower[i - 1] || "") || /[a-z0-9]/.test(lower[i + label.length] || "")) continue;
      const values = lower.slice(Math.max(0, i - 350), i + label.length + 350);
      const window = normalisePeriodWording(lower.slice(Math.max(0, i - 3000), i + label.length + 3000));
      if (containsReportedNumber(values, check.previousValue) && containsReportedNumber(values, check.currentValue)
        && periodIdentified(window, check.previousPeriod, check.previousEnd)
        && periodIdentified(window, check.currentPeriod, check.currentEnd)) return { ok: true, page: pageAt(flat, i) };
    }
  }
  return { ok: false, page: null };
}

/** Value-and-label check for one printed figure: label, value within 350 chars, the period wording within 3000. */
export function textSupportsValue(text: string, check: { labels: string[]; value: number; wording: string }): { ok: boolean; page: number | null } {
  const flat = text.replace(/\s+/g, " ");
  const lower = flat.toLowerCase();
  const wording = normalisePeriodWording(check.wording).replace(/\s+/g, " ").trim();
  if (!wording) return { ok: false, page: null };
  for (const label of [...new Set(check.labels.filter(Boolean))]) {
    for (let i = lower.indexOf(label); i >= 0; i = lower.indexOf(label, i + label.length)) {
      if (/[a-z0-9]/.test(lower[i - 1] || "") || /[a-z0-9]/.test(lower[i + label.length] || "")) continue;
      const values = lower.slice(Math.max(0, i - 350), i + label.length + 350);
      const window = normalisePeriodWording(lower.slice(Math.max(0, i - 3000), i + label.length + 3000));
      if (containsReportedNumber(values, check.value) && window.includes(wording)) return { ok: true, page: pageAt(flat, i) };
    }
  }
  return { ok: false, page: null };
}

const MAX_LINK_DOCUMENTS = 8;   // free Markdown downloads per results window
const MAX_EXTRACTIONS = 3;      // model reads per results window (main path)

/** One printed figure asked of the model: e.g. the FY26 full-year total of "motorcycles". */
export type ValueRequest = { key: string; metric: string; label: string; period: string };
export type ExtractedValue = { key: string; value: number; unit: string; quotedLabel: string; periodWording: string };
export type ExtractValues = (input: { text: string; docType: string; requests: ValueRequest[] }) => Promise<ExtractedValue[]>;

type WindowText = { doc: TapetideDocument; text: string; sha256: string };
type Verified = { row: ExtractedRow; unit: string; basis: string; page: number | null; source: WindowText };
type Component = PrintedComponent & { source: WindowText };

/** Numbers of four or more digits; re-parses of one call share almost all of them. */
function numberFingerprint(text: string): Set<string> {
  return new Set(text.match(/\d[\d,]{3,}(?:\.\d+)?/g)?.map((n) => n.replaceAll(",", "")) ?? []);
}
function nearDuplicate(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  // Re-parses of one document are about the same size; a short results update whose
  // figures are read out on the call is a different document (Havells, 23 Oct).
  if (Math.min(a.size, b.size) / Math.max(a.size, b.size) < 0.8) return false;
  let shared = 0;
  for (const n of a) if (b.has(n)) shared += 1;
  return shared / Math.min(a.size, b.size) >= 0.8;
}

/**
 * Documents with a table naming the target quarter first ("| (In Rs crores) | Q4 FY26 | Q4 FY25 |"),
 * then any that name it, then the rest; otherwise listing order is kept. Havells' Q4 FY26
 * segment table sat in an "Information Update" listed beside three copies of the call.
 */
export function rankByContent<T extends { text: string }>(items: T[], targetPeriodEnd: string): T[] {
  const label = fiscalQuarterLabel(targetPeriodEnd).toLowerCase().replace(/[^a-z0-9]/g, "");
  const compact = (value: string) => normalisePeriodWording(value).replace(/[^a-z0-9]/g, "");
  const rank = (text: string) => text.split("\n").some((line) => line.trimStart().startsWith("|") && compact(line).includes(label)) ? 0
    : compact(text).includes(label) ? 1 : 2;
  return items.map((item, index) => ({ item, index, rank: rank(item.text) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index).map(({ item }) => item);
}

const fy = (year: number) => `FY${String(year).slice(-2)}`;
const formatNumber = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export async function tapetideExecutionEvidence(input: {
  symbol: string; companyName: string; cutoff: string; targetPeriodEnd: string;
  metrics: Array<{ metric: string; units: string[] }>;
  callTool: CallTool; extract: ExtractRows;
  archive: (bytes: Buffer, sha256: string) => Promise<string | null>;
  fetchText?: FetchText;
  /** Single printed figures (full-year totals) for the derived March quarter; omitted = no derivation. */
  extractValues?: ExtractValues;
  labelHints?: string[];
  capturedAt?: string;
}) {
  const diagnostics: Array<Record<string, unknown>> = [];
  const result = { candidates: [] as any[], documents: [] as any[], validations: [] as any[], diagnostics };
  const symbol = input.symbol.trim().toUpperCase();
  const capturedAt = input.capturedAt || new Date().toISOString();
  let reads = 0, linkDownloads = 0, extractions = 0;
  const downloads = new Map<string, Promise<string | null>>();
  let listing: TapetideDocument[] = [];

  /** Every results-window document with a Markdown link, downloaded free, de-duplicated, best first. */
  const windowTexts = async (periodEnd: string): Promise<WindowText[]> => {
    if (!input.fetchText) return [];
    const kept: Array<WindowText & { fingerprint: Set<string> }> = [];
    for (const doc of resultsWindowDocuments(listing, periodEnd, input.cutoff).filter((item) => item.markdown_url).slice(0, MAX_LINK_DOCUMENTS)) {
      const url = doc.markdown_url!;
      if (!downloads.has(url)) downloads.set(url, input.fetchText(url).catch(() => null).then((text) => {
        if (text?.trim()) linkDownloads += 1;
        return text;
      }));
      const text = ((await downloads.get(url)) ?? "").slice(0, 400_000);
      if (!text.trim()) continue;
      const sha256 = createHash("sha256").update(Buffer.from(text, "utf-8")).digest("hex");
      const fingerprint = numberFingerprint(text);
      if (kept.some((item) => item.sha256 === sha256 || nearDuplicate(item.fingerprint, fingerprint))) continue;
      kept.push({ doc, text, sha256, fingerprint });
    }
    return rankByContent(kept, periodEnd);
  };

  // One spelling per unit (Rs.Cr → INR crore) so quarters compare like-for-like.
  const preferredUnit = (raw: string, definition: { units: string[] }) => {
    const unit = normalizeFcsUnit(documentCountUnit(raw, definition.units), definition.units);
    const canonical = canonicalUnitSpelling(unit);
    return definition.units.includes(canonical) ? canonical : unit;
  };

  const verifyComparison = (row: ExtractedRow, source: WindowText, periodEnd: string, metrics: typeof input.metrics): Verified | null => {
    const definition = metrics.find((item) => item.metric === row.metricName);
    const unit = definition ? preferredUnit(row.unit, definition) : "";
    const previousUnit = definition ? preferredUnit(row.previousUnit || row.unit, definition) : "";
    const basis = normalizeComparisonBasis("execution", row.metricName, String(row.comparisonBasis || "").toLowerCase());
    const reject = !definition ? "metric_not_execution"
      // e.g. "International Business (% CCG)" is constant-currency revenue growth, not volume.
      : /volume/.test(row.metricName) && /\b(ccg|constant currency|revenue|value|price|realisation|realization)\b/i.test(row.quotedLabel) ? "volume_label_is_not_volume"
      : !definition.units.includes(unit) || unit !== previousUnit ? "unregistered_or_mixed_unit"
      : row.currentPeriodEndDate !== periodEnd ? "target_period_mismatch"
      : !(row.previousPeriodEndDate < row.currentPeriodEndDate) ? "invalid_period_order"
      : !["same_quarter_prior_year", "sequential_quarter", "point_in_time_prior_period"].includes(basis) ? "unsupported_comparison_basis"
      : !Number.isFinite(row.previousValue) || !Number.isFinite(row.currentValue) ? "invalid_values" : null;
    const support = reject ? { ok: false, page: null } : textSupportsComparison(source.text, {
      // The counted noun printed beside the numbers also names the row ("332,940 motorcycles" when the
      // model's label is the generic "quarter sales"); money units ("Rs crores") are too generic to count.
      labels: [row.metricName.replaceAll("_", " "), ...sourceLabelVariants(row.quotedLabel), ...sourceLabelVariants(row.unit)],
      previousValue: row.previousValue, currentValue: row.currentValue,
      previousPeriod: row.previousPeriod, previousEnd: row.previousPeriodEndDate,
      currentPeriod: row.currentPeriod, currentEnd: row.currentPeriodEndDate });
    if (reject || !support.ok) {
      diagnostics.push({ outcome: reject ?? "document_values_not_verified", metric: row.metricName, doc_id: source.doc.doc_id, period_end: periodEnd,
        candidate: { previous: row.previousValue, current: row.currentValue, unit: row.unit, label: row.quotedLabel } });
      return null;
    }
    return { row, unit, basis, page: support.page, source };
  };

  /** Archive a source text once and list it as a document; null if it cannot be archived. */
  const recordDocument = async (source: WindowText): Promise<string | null> => {
    const documentId = `doc-${source.sha256}`;
    if (result.documents.some((item) => item.document_id === documentId)) return documentId;
    const bytes = Buffer.from(source.text, "utf-8");
    const archiveUri = await input.archive(bytes, source.sha256);
    if (!archiveUri) { diagnostics.push({ outcome: "tapetide_document_not_archived", doc_id: source.doc.doc_id }); return null; }
    const { doc } = source;
    result.documents.push({
      schema_version: "1.0.0", document_id: documentId, issuer_symbol: symbol,
      source_url: doc.pdf_url || `tapetide-mcp://read_document/${doc.doc_id}`, resolved_url: doc.pdf_url || `tapetide-mcp://read_document/${doc.doc_id}`,
      source_type: DOCUMENT_SOURCE_TYPE, source_tier: "secondary_discovery", tapetide_doc_id: doc.doc_id, tapetide_doc_type: doc.doc_type,
      cross_verification: "not_cross_verified_with_exchange_filing", disclosure: DOCUMENT_DISCLOSURE,
      published_at: `${documentDate(doc)}T00:00:00.000Z`, captured_at: capturedAt, archive_uri: archiveUri, sha256: source.sha256,
      media_type: "text/markdown", content_length: bytes.length, acquisition_method: "provider_mcp", acquisition_status: "acquired", failure_reason: null });
    return documentId;
  };

  const pushCandidate = (item: { metric: string; label: string; unit: string; basis: string;
    previous: { label: string; end: string; value: number }; current: { label: string; end: string; value: number };
    previousDocumentId: string; currentDocumentId: string; previousLocator: Record<string, unknown>; currentLocator: Record<string, unknown>;
    method: string; confidence: number; runKey: string; checks: Array<Record<string, unknown>>; validationKind: string }) => {
    const candidateId = `candidate-document-${symbol.toLowerCase()}-${item.metric}-${result.candidates.length + 1}-${input.targetPeriodEnd}`;
    const runId = `run-document-${symbol.toLowerCase()}-${input.targetPeriodEnd}-${item.runKey.slice(0, 12)}`;
    result.candidates.push({
      schema_version: "2.0.0", candidate_id: candidateId, run_id: runId, company_symbol: symbol, company_name: input.companyName || symbol,
      sector_profile_id: null, factor_id: "execution", canonical_metric_id: item.metric, source_metric_label: item.label,
      metric_definition_version: "2.0.0",
      previous_period: { label: item.previous.label, end_date: item.previous.end },
      current_period: { label: item.current.label, end_date: item.current.end, ...(item.basis === "point_in_time_prior_period" ? {} : { duration_months: 3 }) },
      comparison_basis: item.basis, comparison_rule_id: { same_quarter_prior_year: "same-quarter-prior-year-v1",
        sequential_quarter: "sequential-quarter-v1", point_in_time_prior_period: "point-in-time-prior-period-v1" }[item.basis],
      previous_consolidation_basis: PROVIDER_CONSOLIDATION_BASIS, current_consolidation_basis: PROVIDER_CONSOLIDATION_BASIS,
      previous_raw_value: item.previous.value, current_raw_value: item.current.value, previous_raw_unit: item.unit, current_raw_unit: item.unit,
      previous_canonical_value: item.previous.value, current_canonical_value: item.current.value, canonical_unit: item.unit,
      conversion_rule_id: "identity-v1", previous_document_id: item.previousDocumentId, current_document_id: item.currentDocumentId,
      previous_source_locator: item.previousLocator, current_source_locator: item.currentLocator,
      information_cutoff: `${input.cutoff}T00:00:00.000Z`, extraction_method: item.method,
      extractor_version: "tapetide-fcs-documents-v2", producer_id: "tapetide-document-extractor", producer_confidence: item.confidence,
      evidence_source: "provider_document", cross_verification: "not_cross_verified_with_exchange_filing", disclosure: DOCUMENT_DISCLOSURE,
      captured_at: capturedAt });
    result.validations.push({
      schema_version: "2.0.0", validation_id: `validation-${candidateId}-tapetide-document-validator-v1`, run_id: runId, candidate_id: candidateId,
      validator_id: "tapetide-document-validator-v1", validator_version: "1.0.0", validation_kind: item.validationKind,
      status: "qualified_provisional", confidence: item.confidence,
      checks: [...item.checks,
        { check_id: "source.exchange_filing_cross_verification", status: "needs_review", reason_code: "not_cross_verified_with_exchange_filing", detail: DOCUMENT_DISCLOSURE }],
      validated_at: capturedAt });
  };

  const hints = (input.labelHints ?? []).filter(Boolean);
  /** With a hint, rows naming the same measure are kept and others dropped (when any match). */
  const preferHinted = <T extends { quotedLabel: string; unit?: string }>(rows: T[]): T[] => {
    if (!hints.length) return rows;
    const matching = rows.filter((row) => hints.some((hint) => sameSegment(hint, row.quotedLabel) || sameSegment(hint, String(row.unit || ""))));
    return matching.length ? matching : rows;
  };
  const addComparisons = async (source: WindowText, rows: ExtractedRow[]) => {
    for (const row of preferHinted(rows).slice(0, 6)) {
      const verified = verifyComparison(row, source, input.targetPeriodEnd, input.metrics);
      if (!verified) continue;
      const documentId = await recordDocument(source);
      if (!documentId) break;
      const { doc } = source;
      const locator = (period: string) => ({ section: `Tapetide ${doc.doc_type} ${doc.period}`.trim(), page: verified.page ?? undefined,
        quoted_label: `${row.quotedLabel} — ${period} (company document text via Tapetide, not cross-verified with NSE/BSE)`,
        // Printed counted noun ("motorcycles"): identifies the row when the label is generic ("quarter sales").
        unit_wording: row.unit });
      pushCandidate({ metric: row.metricName, label: row.quotedLabel, unit: verified.unit, basis: verified.basis,
        previous: { label: row.previousPeriod, end: row.previousPeriodEndDate, value: row.previousValue },
        current: { label: row.currentPeriod || fiscalQuarterLabel(input.targetPeriodEnd), end: row.currentPeriodEndDate, value: row.currentValue },
        previousDocumentId: documentId, currentDocumentId: documentId, previousLocator: locator(row.previousPeriod), currentLocator: locator(row.currentPeriod),
        method: "model_extraction_from_tapetide_parsed_document", confidence: 0.7, runKey: source.sha256, validationKind: "deterministic_document_text_match",
        checks: [{ check_id: "document.values_and_periods_beside_label", status: "pass", reason_code: null, detail: verified.page ? `page ${verified.page}` : null }] });
    }
  };

  /**
   * March quarter (owner exception, 22 Oct 2026): Q4 = full year − (Q1 + Q2 + Q3) for an
   * additive measure, when no quarter comparison is printed. Each component must be
   * printed beside its label in that period's own results documents (free Markdown links only).
   */
  const deriveMarchQuarter = async () => {
    const target = input.targetPeriodEnd, year = Number(target.slice(0, 4));
    const unavailable = (reason: string, extra: Record<string, unknown> = {}) =>
      diagnostics.push({ outcome: "derived_quarter_unavailable", reason, period_end: target, ...extra });
    const additive = input.metrics.filter((item) => ADDITIVE_EXECUTION_METRICS.has(item.metric));
    if (!additive.length) return unavailable("no_additive_execution_metric");
    const perQuarter: Verified[][] = [];
    for (const end of [`${year - 1}-06-30`, `${year - 1}-09-30`, `${year - 1}-12-31`]) {
      const found: Verified[] = [];
      for (const source of (await windowTexts(end)).slice(0, 2)) {
        extractions += 1;
        const rows = await input.extract({ text: source.text, targetPeriodEnd: end, docType: source.doc.doc_type, metrics: additive, labelHints: hints });
        for (const row of preferHinted(rows)) {
          const verified = verifyComparison(row, source, end, additive);
          if (verified?.basis === "same_quarter_prior_year") found.push(verified);
        }
        if (found.length) break;
      }
      perQuarter.push(found);
    }
    if (perQuarter.some((rows) => !rows.length)) return unavailable("first_three_quarters_incomplete", { quarters_found: perQuarter.map((rows) => rows.length) });
    // Same series in all three quarters: same metric and unit; a lone row of a metric, or the same named segment.
    const alone = (rows: Verified[], metric: string) => metric !== "segment_revenue" && rows.filter((r) => r.row.metricName === metric).length === 1;
    const series = perQuarter[0].map((first) => [first, ...perQuarter.slice(1).map((rows) => rows.find((r) => r.row.metricName === first.row.metricName
        && r.unit === first.unit && ((alone(perQuarter[0], first.row.metricName) && alone(rows, first.row.metricName)) || sameSegment(first.row.quotedLabel, r.row.quotedLabel))))])
      .filter((chain): chain is Verified[] => chain.every(Boolean)).slice(0, 3);
    if (!series.length) return unavailable("first_three_quarters_not_comparable");

    type Slot = "fy_cur" | "q4_cur" | "fy_prev" | "q4_prev";
    const found: Array<Partial<Record<Slot, Component>>> = series.map(() => ({}));
    const ask = async (sources: WindowText[], docYear: number, includePriorYear: boolean) => {
      for (const source of sources) {
        const requests: ValueRequest[] = series.flatMap((chain, index) => [docYear, ...(includePriorYear ? [docYear - 1] : [])].flatMap((y) => [
          { key: `${index}:fy:${y}`, metric: chain[0].row.metricName, label: chain[2].row.quotedLabel, period: `${fy(y)} full financial year (12 months ended ${y}-03-31)` },
          { key: `${index}:q4:${y}`, metric: chain[0].row.metricName, label: chain[2].row.quotedLabel, period: `Q4 ${fy(y)} (quarter ended ${y}-03-31)` }]))
          .filter((request) => { const [index, kind, y] = request.key.split(":"); return !found[+index][`${kind}_${+y === year ? "cur" : "prev"}` as Slot]; });
        if (!requests.length) return;
        extractions += 1;
        for (const value of await input.extractValues!({ text: source.text, docType: source.doc.doc_type, requests })) {
          const request = requests.find((item) => item.key === value.key);
          if (!request) continue;
          const [index, kind, y] = value.key.split(":");
          const slot = `${kind}_${+y === year ? "cur" : "prev"}` as Slot;
          if (found[+index][slot]) continue;
          const chain = series[+index];
          const definition = additive.find((item) => item.metric === chain[0].row.metricName)!;
          const { scale, rest } = countScale(value.unit);
          const wording = normalisePeriodWording(String(value.periodWording || ""));
          const years = [...wording.matchAll(/\bfy(\d{2})\b/g)].map((m) => m[1]);
          const reject = preferredUnit(rest || value.unit, definition) !== chain[0].unit ? "unit_differs_from_quarterly_series"
            : kind === "fy" && (!/\bfy\d{2}\b|financial year|fiscal|full year|for the year|annual/.test(wording) || /\bq[1-4]\b|quarter|half|\bh[12]\b|nine months|\b9m\b/.test(wording)) ? "not_a_full_year_figure"
            : kind === "q4" && (!/\bq4\b|this quarter|the quarter/.test(wording) || /\bq[1-3]\b/.test(wording)) ? "not_a_fourth_quarter_figure"
            : years.length ? (!years.includes(String(y).slice(-2)) ? "period_names_another_year" : null)
            : +y !== docYear ? "prior_year_figure_needs_explicit_year" : null;
          const support = reject ? { ok: false, page: null } : textSupportsValue(source.text, { value: value.value, wording,
            labels: [...sourceLabelVariants(value.quotedLabel), ...chain.flatMap((v) => sourceLabelVariants(v.row.quotedLabel)), chain[0].row.metricName.replaceAll("_", " ")] });
          if (reject || !support.ok) {
            diagnostics.push({ outcome: reject ?? "derived_component_not_verified", key: value.key, doc_id: source.doc.doc_id,
              candidate: { value: value.value, unit: value.unit, label: value.quotedLabel, period: value.periodWording } });
            continue;
          }
          found[+index][slot] = { value: Math.round(value.value * scale * 1e6) / 1e6, halfWidth: printedHalfWidth(value.value, scale),
            period: kind === "fy" ? fy(+y) : `Q4 ${fy(+y)}`, documentId: "", docId: source.doc.doc_id, page: support.page,
            quoted: `${formatNumber(value.value)} ${value.unit}`.trim(), source };
        }
      }
    };
    await ask((await windowTexts(target)).slice(0, 2), year, true);
    if (found.some((slots) => !slots.q4_prev && !slots.fy_prev)) await ask((await windowTexts(`${year - 1}-03-31`)).slice(0, 2), year - 1, false);

    for (const [index, chain] of series.entries()) {
      const slots = found[index], metric = chain[0].row.metricName, label = chain[2].row.quotedLabel;
      const quarters = (side: "cur" | "prev"): Component[] => chain.map((v) => {
        const value = side === "cur" ? v.row.currentValue : v.row.previousValue;
        return { value, halfWidth: printedHalfWidth(value), period: side === "cur" ? v.row.currentPeriod : v.row.previousPeriod,
          documentId: "", docId: v.source.doc.doc_id, page: v.page, quoted: formatNumber(value), source: v.source };
      });
      const sideFor = (side: "cur" | "prev") => slots[`q4_${side}`] ? printedSide(slots[`q4_${side}`]!)
        : slots[`fy_${side}`] ? deriveFourthQuarter(slots[`fy_${side}`]!, quarters(side))
        : { reject: `full_year_total_not_found_${fy(side === "cur" ? year : year - 1)}` };
      const current = sideFor("cur"), previous = sideFor("prev");
      if ("reject" in current || "reject" in previous) {
        unavailable("reject" in current ? current.reject : (previous as { reject: string }).reject, { metric, label });
        continue;
      }
      const reason = derivationAcceptable(metric, current, previous);
      const uncertainty = Math.round(growthUncertaintyPp(current, previous) * 1000) / 1000;
      if (reason) { unavailable(reason, { metric, label, growth_uncertainty_pp: uncertainty }); continue; }
      const components = [...current.components, ...previous.components] as Component[];
      let archived = true;
      for (const component of components) {
        const documentId = await recordDocument(component.source);
        if (!documentId) { archived = false; break; }
        component.documentId = documentId;
      }
      if (!archived) continue;
      const derivation = { method: DERIVATION_METHOD, label: "derived",
        current: { value: current.value, low: current.low, high: current.high, how: describeSide(current, fy(year)) },
        previous: { value: previous.value, low: previous.low, high: previous.high, how: describeSide(previous, fy(year - 1)) },
        growth_uncertainty_pp: uncertainty,
        components: components.map((c) => ({ period: c.period, value: c.value, printed: c.quoted, document_id: c.documentId, tapetide_doc_id: c.docId, page: c.page ?? undefined })) };
      const locator = (side: typeof current, period: string, fiscalYear: string) => ({
        section: side.method === "printed" ? `Tapetide ${side.components[0].docId} (printed)` : "Derived from company documents via Tapetide",
        page: side.method === "printed" ? side.components[0].page ?? undefined : undefined,
        quoted_label: `${label} — ${period} (${side.method === "printed" ? "as printed" : `derived: ${fiscalYear} full year − Q1 to Q3`}; company document text via Tapetide, not cross-verified with NSE/BSE)`,
        unit_wording: chain[0].row.unit, derivation });
      pushCandidate({ metric, label, unit: chain[0].unit, basis: "same_quarter_prior_year",
        previous: { label: `Q4 ${fy(year - 1)}`, end: `${year - 1}-03-31`, value: previous.value },
        current: { label: `Q4 ${fy(year)}`, end: target, value: current.value },
        previousDocumentId: previous.components[0].documentId, currentDocumentId: current.components[0].documentId,
        previousLocator: locator(previous, `Q4 ${fy(year - 1)}`, fy(year - 1)), currentLocator: locator(current, `Q4 ${fy(year)}`, fy(year)),
        method: `derived_${DERIVATION_METHOD}`, confidence: 0.6, runKey: createHash("sha256").update(JSON.stringify(derivation)).digest("hex"),
        validationKind: "deterministic_derivation_from_document_text",
        checks: [
          { check_id: "derived.components_beside_labels", status: "pass", reason_code: null,
            detail: components.map((c) => `${c.period} ${c.quoted} (doc ${c.docId}${c.page ? ` p${c.page}` : ""})`).join("; ") },
          { check_id: "derived.additive_measure", status: "pass", reason_code: null, detail: metric },
          { check_id: "derived.rounding_within_tolerance", status: "pass", reason_code: null, detail: `growth rate ±${uncertainty} pp from printed precision` },
          { check_id: "derived.plausible_against_first_three_quarters", status: "pass", reason_code: null, detail: null }] });
      diagnostics.push({ outcome: "derived_quarter_execution_ready", metric, label, current: derivation.current.how, previous: derivation.previous.how, growth_uncertainty_pp: uncertainty });
    }
  };

  try {
    // Concalls and presentations for roughly 20 months: reaches the prior year's March-quarter call.
    // Same arguments for every quarter of a job, so the listing is one (cached) plan call.
    const since = new Date(Date.parse(`${input.cutoff}T00:00:00Z`) - 600 * 86_400_000).toISOString().slice(0, 10);
    listing = documentsFromListing(await input.callTool("list_company_documents", { symbol, doc_types: ["concall", "presentation"], since, limit: 40 }));
    const window = resultsWindowDocuments(listing, input.targetPeriodEnd, input.cutoff);
    diagnostics.push({ outcome: "tapetide_documents_listed", readable: listing.length, in_results_window: window.length, period_end: input.targetPeriodEnd });
    // 1. Every results-window document via its free Markdown link, best first.
    const texts = await windowTexts(input.targetPeriodEnd);
    for (const source of texts.slice(0, MAX_EXTRACTIONS)) {
      if (result.candidates.length) break;
      extractions += 1;
      await addComparisons(source, await input.extract({ text: source.text, targetPeriodEnd: input.targetPeriodEnd, docType: source.doc.doc_type, metrics: input.metrics, labelHints: hints }));
    }
    // 2. No link text at all: paged reads (plan calls) of the two best-placed documents.
    for (const doc of texts.length ? [] : window.slice(0, 2)) {
      if (result.candidates.length) break;
      let text = "", pages: string | null = "1-12";
      while (pages && reads < MAX_READS) {
        reads += 1;
        // max_chars above the documented 24,000 returns a truncated payload without `markdown`.
        const page = textFromReadDocument(await input.callTool("read_document", { doc_id: doc.doc_id, pages, max_chars: 20000 }));
        text += `${text ? "\n" : ""}${page.text}`;
        pages = /concall/i.test(doc.doc_type) ? page.nextPages : null;   // transcripts state KPIs later in the call
      }
      if (!text.trim()) { diagnostics.push({ outcome: "tapetide_document_empty", doc_id: doc.doc_id }); continue; }
      const source = { doc, text, sha256: createHash("sha256").update(Buffer.from(text, "utf-8")).digest("hex") };
      extractions += 1;
      await addComparisons(source, await input.extract({ text, targetPeriodEnd: input.targetPeriodEnd, docType: doc.doc_type, metrics: input.metrics, labelHints: hints }));
    }
    // 3. March quarter with no printed quarter comparison: derive it.
    if (!result.candidates.length && input.targetPeriodEnd.slice(5) === "03-31" && input.extractValues && input.fetchText) await deriveMarchQuarter();
  } catch (error) {
    diagnostics.push({ outcome: error instanceof Error && error.message === "tapetide_quota_exhausted" ? "tapetide_quota_exhausted" : "tapetide_documents_failed",
      detail: error instanceof Error ? error.message : String(error) });
  }
  diagnostics.push({ outcome: result.candidates.length ? "tapetide_document_execution_ready" : "tapetide_document_execution_unavailable",
    comparison_count: result.candidates.length, document_reads: reads, markdown_link_downloads: linkDownloads, model_extractions: extractions,
    derived: result.candidates.some((c) => String(c.extraction_method).startsWith("derived_")), period_end: input.targetPeriodEnd });
  return result;
}
