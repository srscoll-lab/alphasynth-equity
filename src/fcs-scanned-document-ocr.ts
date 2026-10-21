/**
 * OCR for scanned results filings (e.g. Solar Industries' March 2026 audited
 * results: a typed cover letter followed by image-only pages).
 *
 * Google Cloud Document AI (Enterprise Document OCR) is used deliberately:
 * it is independent of the Gemini extractor, so the deterministic source-value
 * check still compares model output against text the model did not produce.
 * Misread digits cause rejections; nothing here repairs or infers values.
 *
 * Bounded: only sparse-text PDFs, at most `maxDocuments` per review, the first
 * `maxPages` pages, low-confidence pages dropped, results cached by SHA-256.
 */

export const OCR_TEXT_SOURCE = "document_ai_ocr";
const DEFAULT_MAX_PAGES = 30; // Document AI online limit in imageless mode.
const DEFAULT_MIN_PAGE_CONFIDENCE = 0.85;
const DEFAULT_MAX_DOCUMENTS = 2;
const SPARSE_CHARS_PER_PAGE = 150;
const MAX_INLINE_BYTES = 20 * 1024 * 1024;

export type OcrDiagnostic = { outcome: string; sha256?: string; detail?: string; pages_used?: number; pages_dropped?: number; mean_confidence?: number };
export type CachedOcr = { text: string; processor: string; pages_used: number; pages_dropped: number; mean_confidence: number };
export type OcrCache = { get(sha256: string): Promise<CachedOcr | null>; put(sha256: string, value: CachedOcr): Promise<void> };

export type FcsOcrOptions = {
  /** projects/{project}/locations/{us|eu}/processors/{id} */
  processor: string;
  accessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  cache?: OcrCache;
  maxDocuments?: number;
  maxPages?: number;
  minPageConfidence?: number;
  timeoutMs?: number;
};

export type OcrResult = { text: string; textSource: typeof OCR_TEXT_SOURCE; fromCache: boolean } | null;

/** A PDF whose text layer is nearly empty relative to its page count is treated as scanned. */
export function looksScanned(text: string, pageCount: number): boolean {
  if (!Number.isInteger(pageCount) || pageCount < 2) return false;
  return text.replace(/\s+/g, " ").trim().length / pageCount < SPARSE_CHARS_PER_PAGE;
}

const PROCESSOR = /^projects\/[a-z0-9-]+\/locations\/(us|eu)\/processors\/[a-z0-9]+$/;

/** Build Document AI page text, keeping only pages at or above the confidence floor. */
export function documentAiPageText(document: any, minPageConfidence: number) {
  const fullText = String(document?.text || "");
  const pages = Array.isArray(document?.pages) ? document.pages : [];
  const kept: string[] = [];
  const confidences: number[] = [];
  let dropped = 0;
  for (const page of pages) {
    const confidence = Number(page?.layout?.confidence);
    const segments = Array.isArray(page?.layout?.textAnchor?.textSegments) ? page.layout.textAnchor.textSegments : [];
    const text = segments.map((segment: any) => fullText.slice(Number(segment.startIndex || 0), Number(segment.endIndex || 0))).join("");
    if (!Number.isFinite(confidence) || confidence < minPageConfidence || !text.trim()) { dropped += 1; continue; }
    confidences.push(confidence);
    kept.push(`[PAGE ${Number(page.pageNumber) || kept.length + 1}]\n${text.trim()}`);
  }
  const mean = confidences.length ? Number((confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(4)) : 0;
  return { text: kept.join("\n\n"), pagesUsed: kept.length, pagesDropped: dropped, meanConfidence: mean };
}

/**
 * One OCR budget per evidence review. The returned function is the retrieval
 * hook: it receives an already-downloaded PDF and returns OCR text or null.
 */
export function createFcsScannedDocumentOcr(options: FcsOcrOptions) {
  const diagnostics: OcrDiagnostic[] = [];
  if (!PROCESSOR.test(options.processor)) throw new Error("Invalid Document AI processor name.");
  const location = options.processor.split("/")[3];
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxDocuments = Math.max(0, Math.min(options.maxDocuments ?? DEFAULT_MAX_DOCUMENTS, 4));
  const maxPages = Math.max(1, Math.min(options.maxPages ?? DEFAULT_MAX_PAGES, DEFAULT_MAX_PAGES));
  const minPageConfidence = options.minPageConfidence ?? DEFAULT_MIN_PAGE_CONFIDENCE;
  let processed = 0;

  async function ocr(input: { data: Uint8Array; sha256: string; text: string; pageCount: number }): Promise<OcrResult> {
    if (!looksScanned(input.text, input.pageCount)) return null;
    const cached = await options.cache?.get(input.sha256).catch(() => null);
    if (cached?.text) {
      diagnostics.push({ outcome: "ocr_cache_hit", sha256: input.sha256, pages_used: cached.pages_used,
        pages_dropped: cached.pages_dropped, mean_confidence: cached.mean_confidence });
      return { text: cached.text, textSource: OCR_TEXT_SOURCE, fromCache: true };
    }
    if (processed >= maxDocuments) { diagnostics.push({ outcome: "ocr_budget_exhausted", sha256: input.sha256 }); return null; }
    if (input.data.byteLength > MAX_INLINE_BYTES) { diagnostics.push({ outcome: "ocr_document_too_large", sha256: input.sha256 }); return null; }
    processed += 1;
    try {
      const response = await fetchImpl(`https://${location}-documentai.googleapis.com/v1/${options.processor}:process`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await options.accessToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          rawDocument: { content: Buffer.from(input.data).toString("base64"), mimeType: "application/pdf" },
          processOptions: { fromStart: maxPages },
          imagelessMode: true,
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
      });
      if (!response.ok) { diagnostics.push({ outcome: "ocr_request_failed", sha256: input.sha256, detail: `HTTP ${response.status}` }); return null; }
      const payload: any = await response.json();
      const page = documentAiPageText(payload?.document, minPageConfidence);
      diagnostics.push({ outcome: page.text ? "ocr_completed" : "ocr_no_confident_text", sha256: input.sha256,
        pages_used: page.pagesUsed, pages_dropped: page.pagesDropped, mean_confidence: page.meanConfidence });
      if (!page.text) return null;
      const value: CachedOcr = { text: page.text, processor: options.processor, pages_used: page.pagesUsed,
        pages_dropped: page.pagesDropped, mean_confidence: page.meanConfidence };
      await options.cache?.put(input.sha256, value).catch((error) =>
        diagnostics.push({ outcome: "ocr_cache_write_failed", sha256: input.sha256, detail: error instanceof Error ? error.message : String(error) }));
      return { text: page.text, textSource: OCR_TEXT_SOURCE, fromCache: false };
    } catch (error) {
      diagnostics.push({ outcome: "ocr_request_failed", sha256: input.sha256, detail: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }
  return { ocr, diagnostics, processedCount: () => processed };
}
