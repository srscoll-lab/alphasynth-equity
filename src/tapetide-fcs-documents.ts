import { createHash } from "node:crypto";
import { containsReportedNumber, containsReportingPeriod, sourceLabelVariants } from "./fundamental-review-source-match.ts";
import { normalizeComparisonBasis } from "./fcs-comparison-basis.ts";
import { normalizeFcsUnit } from "./fcs-evidence-normalization.ts";
import { fiscalQuarterLabel, PROVIDER_CONSOLIDATION_BASIS } from "./tapetide-fcs-evidence.ts";

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
export type ExtractRows = (input: { text: string; targetPeriodEnd: string; docType: string; metrics: Array<{ metric: string; units: string[] }> }) => Promise<ExtractedRow[]>;

/**
 * Counts are printed with the counted noun ("332,940 motorcycles"). Map such
 * nouns to the registered count unit; values are never changed.
 */
const VEHICLE_NOUNS = /^(?:motor ?cycles?|bikes?|scooters?|cars?|passenger vehicles?|tractors?|trucks?|buses|bus|two[- ]wheelers?|three[- ]wheelers?|commercial vehicles?|cvs?|evs?)$/i;
const GENERIC_COUNT_NOUNS = /^(?:nos\.?|numbers?|pieces?|pcs\.?|count)$/i;
export function documentCountUnit(raw: string, allowed: readonly string[]): string {
  const unit = String(raw || "").trim();
  if (VEHICLE_NOUNS.test(unit) && allowed.includes("vehicles")) return "vehicles";
  if ((VEHICLE_NOUNS.test(unit) || GENERIC_COUNT_NOUNS.test(unit)) && allowed.includes("units")) return "units";
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
    .replace(/\b(q[1-4])\s+of\s+(the\s+)?/g, "$1 ")
    .replace(/\bfy\s*'?\s*(\d{2})\s*-\s*(\d{2})\b/g, "fy$2");   // "FY 26-27" → "fy27"
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
        && containsReportingPeriod(window, check.previousPeriod, check.previousEnd)
        && containsReportingPeriod(window, check.currentPeriod, check.currentEnd)) return { ok: true, page: pageAt(flat, i) };
    }
  }
  return { ok: false, page: null };
}

export async function tapetideExecutionEvidence(input: {
  symbol: string; companyName: string; cutoff: string; targetPeriodEnd: string;
  metrics: Array<{ metric: string; units: string[] }>;
  callTool: CallTool; extract: ExtractRows;
  archive: (bytes: Buffer, sha256: string) => Promise<string | null>;
  fetchText?: FetchText;
  capturedAt?: string;
}) {
  const diagnostics: Array<Record<string, unknown>> = [];
  const result = { candidates: [] as any[], documents: [] as any[], validations: [] as any[], diagnostics };
  const symbol = input.symbol.trim().toUpperCase();
  const capturedAt = input.capturedAt || new Date().toISOString();
  let reads = 0, linkDownloads = 0;
  try {
    const listing = documentsFromListing(await input.callTool("list_company_documents", { symbol, limit: 15 }));
    const picks = resultsWindowDocuments(listing, input.targetPeriodEnd, input.cutoff).slice(0, 2);
    diagnostics.push({ outcome: "tapetide_documents_listed", readable: listing.length, in_results_window: picks.length, period_end: input.targetPeriodEnd });
    for (const doc of picks) {
      if (result.candidates.length) break;
      // Full parsed Markdown via its download link costs no plan call; fall back to paged reads.
      let text = doc.markdown_url && input.fetchText ? (await input.fetchText(doc.markdown_url).catch(() => null)) ?? "" : "";
      if (text.trim()) { linkDownloads += 1; text = text.slice(0, 400_000); }
      let pages: string | null = text.trim() ? null : "1-12";
      while (pages && reads < MAX_READS) {
        reads += 1;
        // max_chars above the documented 24,000 returns a truncated payload without `markdown`.
        const page = textFromReadDocument(await input.callTool("read_document", { doc_id: doc.doc_id, pages, max_chars: 20000 }));
        text += `${text ? "\n" : ""}${page.text}`;
        pages = /concall/i.test(doc.doc_type) ? page.nextPages : null;   // transcripts state KPIs later in the call
      }
      if (!text.trim()) { diagnostics.push({ outcome: "tapetide_document_empty", doc_id: doc.doc_id }); continue; }
      const rows = await input.extract({ text, targetPeriodEnd: input.targetPeriodEnd, docType: doc.doc_type, metrics: input.metrics });
      const bytes = Buffer.from(text, "utf-8");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      let archiveUri: string | null = null;
      for (const row of rows.slice(0, 6)) {
        const definition = input.metrics.find((item) => item.metric === row.metricName);
        const unit = definition ? normalizeFcsUnit(documentCountUnit(row.unit, definition.units), definition.units) : "";
        const previousUnit = definition ? normalizeFcsUnit(documentCountUnit(row.previousUnit || row.unit, definition.units), definition.units) : "";
        const basis = normalizeComparisonBasis("execution", row.metricName, String(row.comparisonBasis || "").toLowerCase());
        const reject = !definition ? "metric_not_execution"
          : !definition.units.includes(unit) || unit !== previousUnit ? "unregistered_or_mixed_unit"
          : row.currentPeriodEndDate !== input.targetPeriodEnd ? "target_period_mismatch"
          : !(row.previousPeriodEndDate < row.currentPeriodEndDate) ? "invalid_period_order"
          : !["same_quarter_prior_year", "sequential_quarter", "point_in_time_prior_period"].includes(basis) ? "unsupported_comparison_basis"
          : !Number.isFinite(row.previousValue) || !Number.isFinite(row.currentValue) ? "invalid_values" : null;
        const support = reject ? { ok: false, page: null } : textSupportsComparison(text, {
          labels: [row.metricName.replaceAll("_", " "), ...sourceLabelVariants(row.quotedLabel)],
          previousValue: row.previousValue, currentValue: row.currentValue,
          previousPeriod: row.previousPeriod, previousEnd: row.previousPeriodEndDate,
          currentPeriod: row.currentPeriod, currentEnd: row.currentPeriodEndDate });
        if (reject || !support.ok) {
          diagnostics.push({ outcome: reject ?? "document_values_not_verified", metric: row.metricName, doc_id: doc.doc_id,
            candidate: { previous: row.previousValue, current: row.currentValue, unit: row.unit, label: row.quotedLabel } });
          continue;
        }
        archiveUri ??= await input.archive(bytes, sha256);
        if (!archiveUri) { diagnostics.push({ outcome: "tapetide_document_not_archived", doc_id: doc.doc_id }); break; }
        const documentId = `doc-${sha256}`;
        if (!result.documents.some((item) => item.document_id === documentId)) result.documents.push({
          schema_version: "1.0.0", document_id: documentId, issuer_symbol: symbol,
          source_url: doc.pdf_url || `tapetide-mcp://read_document/${doc.doc_id}`, resolved_url: doc.pdf_url || `tapetide-mcp://read_document/${doc.doc_id}`,
          source_type: DOCUMENT_SOURCE_TYPE, source_tier: "secondary_discovery", tapetide_doc_id: doc.doc_id, tapetide_doc_type: doc.doc_type,
          cross_verification: "not_cross_verified_with_exchange_filing", disclosure: DOCUMENT_DISCLOSURE,
          published_at: `${documentDate(doc)}T00:00:00.000Z`, captured_at: capturedAt, archive_uri: archiveUri, sha256,
          media_type: "text/markdown", content_length: bytes.length, acquisition_method: "provider_mcp", acquisition_status: "acquired", failure_reason: null });
        const candidateId = `candidate-document-${symbol.toLowerCase()}-${row.metricName}-${result.candidates.length + 1}-${input.targetPeriodEnd}`;
        const runId = `run-document-${symbol.toLowerCase()}-${input.targetPeriodEnd}-${sha256.slice(0, 12)}`;
        const locator = (period: string) => ({ section: `Tapetide ${doc.doc_type} ${doc.period}`.trim(), page: support.page ?? undefined,
          quoted_label: `${row.quotedLabel} — ${period} (company document text via Tapetide, not cross-verified with NSE/BSE)` });
        result.candidates.push({
          schema_version: "2.0.0", candidate_id: candidateId, run_id: runId, company_symbol: symbol, company_name: input.companyName || symbol,
          sector_profile_id: null, factor_id: "execution", canonical_metric_id: row.metricName, source_metric_label: row.quotedLabel,
          metric_definition_version: "2.0.0",
          previous_period: { label: row.previousPeriod, end_date: row.previousPeriodEndDate },
          current_period: { label: row.currentPeriod || fiscalQuarterLabel(input.targetPeriodEnd), end_date: row.currentPeriodEndDate,
            ...(basis === "point_in_time_prior_period" ? {} : { duration_months: 3 }) },
          comparison_basis: basis, comparison_rule_id: { same_quarter_prior_year: "same-quarter-prior-year-v1",
            sequential_quarter: "sequential-quarter-v1", point_in_time_prior_period: "point-in-time-prior-period-v1" }[basis],
          previous_consolidation_basis: PROVIDER_CONSOLIDATION_BASIS, current_consolidation_basis: PROVIDER_CONSOLIDATION_BASIS,
          previous_raw_value: row.previousValue, current_raw_value: row.currentValue, previous_raw_unit: unit, current_raw_unit: unit,
          previous_canonical_value: row.previousValue, current_canonical_value: row.currentValue, canonical_unit: unit,
          conversion_rule_id: "identity-v1", previous_document_id: documentId, current_document_id: documentId,
          previous_source_locator: locator(row.previousPeriod), current_source_locator: locator(row.currentPeriod),
          information_cutoff: `${input.cutoff}T00:00:00.000Z`, extraction_method: "model_extraction_from_tapetide_parsed_document",
          extractor_version: "tapetide-fcs-documents-v1", producer_id: "tapetide-document-extractor", producer_confidence: 0.7,
          evidence_source: "provider_document", cross_verification: "not_cross_verified_with_exchange_filing", disclosure: DOCUMENT_DISCLOSURE,
          captured_at: capturedAt });
        result.validations.push({
          schema_version: "2.0.0", validation_id: `validation-${candidateId}-tapetide-document-validator-v1`, run_id: runId, candidate_id: candidateId,
          validator_id: "tapetide-document-validator-v1", validator_version: "1.0.0", validation_kind: "deterministic_document_text_match",
          status: "qualified_provisional", confidence: 0.7,
          checks: [
            { check_id: "document.values_and_periods_beside_label", status: "pass", reason_code: null, detail: support.page ? `page ${support.page}` : null },
            { check_id: "source.exchange_filing_cross_verification", status: "needs_review", reason_code: "not_cross_verified_with_exchange_filing", detail: DOCUMENT_DISCLOSURE },
          ], validated_at: capturedAt });
      }
    }
  } catch (error) {
    diagnostics.push({ outcome: error instanceof Error && error.message === "tapetide_quota_exhausted" ? "tapetide_quota_exhausted" : "tapetide_documents_failed",
      detail: error instanceof Error ? error.message : String(error) });
  }
  diagnostics.push({ outcome: result.candidates.length ? "tapetide_document_execution_ready" : "tapetide_document_execution_unavailable",
    comparison_count: result.candidates.length, document_reads: reads, markdown_link_downloads: linkDownloads, period_end: input.targetPeriodEnd });
  return result;
}
