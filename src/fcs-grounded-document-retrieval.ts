import { createHash } from "node:crypto";
import { extractPdfTextLocally } from "./pdf-text.ts";

export interface GroundedDocumentCandidate { uri: string; title?: string }
export interface RetrievedGroundedDocument {
  sourceUrl: string;
  discoveryUrl: string;
  title?: string;
  text: string;
  mediaType: "application/pdf" | "text/html";
  sha256: string;
  byteLength: number;
  bytes: Uint8Array;
}
export interface RetrievalDiagnostic {
  stage: "discovery" | "download" | "extraction" | "limit";
  code: string;
  url: string;
  detail?: string;
}
export interface GroundedRetrievalOptions {
  // Must come from independently verified issuer metadata, never grounding titles.
  trustedIssuerDomains: readonly string[];
  maxDocuments?: number;
  maxRequests?: number;
  maxDocumentBytes?: number;
  maxTotalBytes?: number;
  timeoutMs?: number;
  maximumPages?: number;
  fetchImpl?: typeof fetch;
  extractText?: typeof extractPdfTextLocally;
}

const EXCHANGE_DOMAINS = ["nseindia.com", "nsearchives.nseindia.com", "bseindia.com"];
const GOOGLE_DISCOVERY_HOST = "vertexaisearch.cloud.google.com";
const bounded = (value: number | undefined, fallback: number, ceiling: number) =>
  Math.max(1, Math.min(ceiling, Math.floor(Number.isFinite(value) ? value! : fallback)));
const decodeAttribute = (value: string) => value.replace(/&amp;/gi, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

function financialHtmlText(html: string): string | null {
  const attributes = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(match => [match[1].toLowerCase(), decodeAttribute(match[2] ?? match[3] ?? match[4])]));
  const publicationMetadata = new Set<string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const key = attrs.property ?? attrs.name ?? attrs.itemprop;
    if ((key === "article:published_time" || key === "datePublished") && attrs.content?.trim()) {
      publicationMetadata.add(`${key}: ${attrs.content.trim()}`);
    }
  }
  // Only the explicit publication field is taken from structured data. Script prose
  // and dateModified are never admitted into visible financial evidence.
  const collectPublished = (value: unknown, depth = 0): void => {
    if (!value || typeof value !== "object" || depth > 12) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "datePublished" && typeof child === "string" && child.trim()) publicationMetadata.add(`datePublished: ${child.trim()}`);
      else if (typeof child === "object") collectPublished(child, depth + 1);
    }
  };
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attributes(match[1]).type?.toLowerCase() !== "application/ld+json") continue;
    try { collectPublished(JSON.parse(match[2])); } catch { /* Malformed metadata has no provenance. */ }
  }
  const markup = html.replace(/<!--[^]*?(?:-->|$)/g, " ").replace(/<(script|style|noscript|template|svg)\b[^>]*>[^]*?(?:<\/\1\s*>|$)/gi, " ");
  const stack: { tag: string; suppress: boolean }[] = [];
  const parts: string[] = [];
  const voidTags = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/;
  for (const match of markup.matchAll(/<[^>]*>|[^<]+/g)) {
    const token = match[0];
    if (!token.startsWith("<")) {
      if (!stack.some(item => item.suppress)) parts.push(token);
      continue;
    }
    const tagMatch = token.match(/^<\s*(\/?)\s*([\w-]+)/);
    if (!tagMatch) continue;
    const tag = tagMatch[2].toLowerCase();
    if (tagMatch[1]) {
      const index = stack.map(item => item.tag).lastIndexOf(tag);
      if (index >= 0) stack.splice(index);
      parts.push(" ");
      continue;
    }
    const attrs = attributes(token);
    const suppress = /^(?:head|nav|header|footer|aside|form|button)$/.test(tag)
      || /\bhidden\b/i.test(token) || attrs["aria-hidden"] === "true"
      || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrs.style ?? "")
      || /(?:^|[\s_-])(?:nav|navigation|menu|breadcrumb|cookie|footer|header)(?:$|[\s_-])/i.test(`${attrs.class ?? ""} ${attrs.id ?? ""}`)
      || /^(?:navigation|banner|contentinfo)$/.test(attrs.role ?? "");
    if (!voidTags.test(tag) && !/\/\s*>$/.test(token)) {
      if (stack.length >= 128) return null;
      stack.push({ tag, suppress });
    }
    parts.push(" ");
  }
  const visibleText = decodeAttribute(parts.join(" ")).replace(/&(?:nbsp|quot|apos|lt|gt);/gi, entity => ({ "&nbsp;": " ", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" })[entity.toLowerCase()] ?? entity).replace(/\s+/g, " ").trim();
  if (visibleText.length < 500 || !/\bfinancial\s+results\b|\bquarter(?:\s+and\s+[^.]{1,50})?\s+ended\b/i.test(visibleText) || !/\brevenue\b|\bprofit\b|\bcash[\s-]*flow\b/i.test(visibleText)) return null;
  return publicationMetadata.size ? `${[...publicationMetadata].join("\n")}\n\n${visibleText}` : visibleText;
}

/** Bounded discovery/download only. Document dates and financial evidence are validated by callers. */
export async function retrieveGroundedFcsDocuments(
  candidates: readonly GroundedDocumentCandidate[], options: GroundedRetrievalOptions,
): Promise<{ documents: RetrievedGroundedDocument[]; diagnostics: RetrievalDiagnostic[] }> {
  const documents: RetrievedGroundedDocument[] = [];
  const diagnostics: RetrievalDiagnostic[] = [];
  const domains = [...EXCHANGE_DOMAINS, ...options.trustedIssuerDomains.map(domain => domain.trim().toLowerCase())]
    .filter(domain => /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain));
  const maxDocuments = bounded(options.maxDocuments, 6, 12);
  const maxRequests = bounded(options.maxRequests, 30, 60);
  const maxDocumentBytes = bounded(options.maxDocumentBytes, 8 * 1024 * 1024, 20 * 1024 * 1024);
  const maxTotalBytes = bounded(options.maxTotalBytes, 32 * 1024 * 1024, 80 * 1024 * 1024);
  const timeoutMs = bounded(options.timeoutMs, 45_000, 120_000);
  const maximumPages = bounded(options.maximumPages, 20, 60);
  const fetchImpl = options.fetchImpl ?? fetch;
  const extractText = options.extractText ?? extractPdfTextLocally;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let requests = 0;
  let totalBytes = 0;
  const visited = new Set<string>();
  const hashes = new Set<string>();
  const diagnostic = (stage: RetrievalDiagnostic["stage"], code: string, url: string, detail?: string) =>
    diagnostics.push({ stage, code, url, ...(detail ? { detail } : {}) });
  const parseUrl = (raw: string, base?: string): URL | null => {
    try {
      const url = new URL(raw, base);
      if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
      url.hash = "";
      return url;
    } catch { return null; }
  };
  const trusted = (url: URL) => domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  const googleDiscovery = (url: URL) => url.hostname === GOOGLE_DISCOVERY_HOST && url.pathname.startsWith("/grounding-api-redirect/");
  const stop = () => controller.signal.aborted || requests >= maxRequests || totalBytes >= maxTotalBytes || documents.length >= maxDocuments;

  async function download(initial: URL): Promise<{ url: URL; data: Uint8Array; contentType: string } | null> {
    let url = initial;
    for (let hop = 0; hop <= 5; hop++) {
      const isGoogle = googleDiscovery(url);
      if (!trusted(url) && !isGoogle) {
        diagnostic("discovery", "rejected_domain", url.href, url.hostname);
        return null;
      }
      if (stop()) { diagnostic("limit", "retrieval_limit", url.href); return null; }
      if (visited.has(url.href)) return null;
      visited.add(url.href);
      requests++;
      // One slow discovery redirect must not consume the entire candidate budget.
      // Keep the global deadline as well as a shorter per-request bound.
      const requestSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(isGoogle ? 4_000 : 12_000)]);
      const response = await fetchImpl(url.href, { redirect: "manual", signal: requestSignal, headers: { Accept: "application/pdf,text/html;q=0.9", "User-Agent": "AlphaSynth-Official-Document-Retrieval/1.0" } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        const next = location ? parseUrl(location, url.href) : null;
        if (!next) { diagnostic("discovery", "invalid_redirect", url.href); return null; }
        diagnostic("discovery", "redirect_resolved", url.href, next.href);
        url = next;
        continue;
      }
      // Google responses can locate sources but can never become issuer evidence.
      if (isGoogle) { await response.body?.cancel(); diagnostic("discovery", "unresolved_grounding_redirect", url.href); return null; }
      if (!response.ok) { await response.body?.cancel(); diagnostic("download", "http_error", url.href, String(response.status)); return null; }
      if (response.url && response.url !== url.href) {
        await response.body?.cancel();
        diagnostic("download", "unexpected_automatic_redirect", url.href, response.url);
        return null;
      }
      const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const byteLimit = Math.min(maxDocumentBytes, maxTotalBytes - totalBytes, contentType === "text/html" ? 1024 * 1024 : maxDocumentBytes);
      const declaredLength = Number(response.headers.get("content-length"));
      if (declaredLength > byteLimit) { await response.body?.cancel(); diagnostic("limit", "document_bytes_exceeded", url.href); return null; }
      const reader = response.body?.getReader();
      if (!reader) { diagnostic("download", "empty_body", url.href); return null; }
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          totalBytes += value.byteLength;
          if (size > byteLimit || controller.signal.aborted) { await reader.cancel(); diagnostic("limit", "document_bytes_exceeded", url.href); return null; }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const data = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
      return { url, data, contentType };
    }
    diagnostic("limit", "redirect_limit", initial.href);
    return null;
  }

  async function visit(raw: string, candidate: GroundedDocumentCandidate, allowHtml: boolean): Promise<void> {
    const initial = parseUrl(raw);
    if (!initial) { diagnostic("discovery", "invalid_url", raw); return; }
    try {
      const result = await download(initial);
      if (!result) return;
      const { url, data, contentType } = result;
      const pdfMagic = new TextDecoder().decode(data.subarray(0, 1024)).includes("%PDF-");
      if (pdfMagic || contentType === "application/pdf") {
        diagnostic("download", "PDF_downloaded", url.href, String(data.byteLength));
        const sha256 = createHash("sha256").update(data).digest("hex");
        if (hashes.has(sha256)) return;
        let abortHandler: (() => void) | undefined;
        try {
          const text = await Promise.race([
            extractText(data, maximumPages),
            new Promise<never>((_, reject) => {
              abortHandler = () => reject(new Error("retrieval_timeout"));
              controller.signal.addEventListener("abort", abortHandler, { once: true });
              if (controller.signal.aborted) abortHandler();
            }),
          ]);
          diagnostic("extraction", "pdf_text_chars", url.href, String(text.length));
          if (!text.trim()) { diagnostic("extraction", "empty_pdf_text", url.href); return; }
          hashes.add(sha256);
          documents.push({ sourceUrl: url.href, discoveryUrl: candidate.uri, title: candidate.title, text, mediaType: "application/pdf", sha256, byteLength: data.byteLength, bytes: data });
          diagnostic("extraction", "document_retrieved", url.href);
        } catch (error) { diagnostic("extraction", "pdf_extraction_error", url.href, error instanceof Error ? error.message : String(error)); }
        finally { if (abortHandler) controller.signal.removeEventListener("abort", abortHandler); }
        return;
      }
      const html = new TextDecoder().decode(data);
      if (allowHtml && (contentType === "text/html" || /^\s*(?:<!doctype html|<html)/i.test(html))) {
        const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)].slice(0, 500);
        let followed = 0;
        for (const match of links) {
          const href = match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
          if (!href) continue;
          const link = parseUrl(decodeAttribute(href[1] ?? href[2] ?? href[3]), url.href);
          if (!link || !( /\.pdf(?:$|\?)/i.test(link.href) || /application\/pdf|\bpdf\b/i.test(`${match[1]} ${match[2].replace(/<[^>]+>/g, " ")}`))) continue;
          if (!trusted(link)) { diagnostic("discovery", "rejected_domain", link.href, link.hostname); continue; }
          if (followed++ >= 12 || stop()) break;
          await visit(link.href, candidate, false);
        }
        diagnostic("discovery", "landing_page_scanned", url.href, `${Math.min(followed, 12)} PDF links considered`);
        const text = financialHtmlText(html);
        if (!text) { diagnostic("extraction", "html_not_financial_release", url.href); return; }
        const sha256 = createHash("sha256").update(data).digest("hex");
        // Downloads may exhaust request/byte limits; an already downloaded page
        // still fits those budgets, but cannot exceed the document/time bounds.
        if (controller.signal.aborted || documents.length >= maxDocuments || hashes.has(sha256)) return;
        hashes.add(sha256);
        documents.push({ sourceUrl: url.href, discoveryUrl: candidate.uri, title: candidate.title, text, mediaType: "text/html", sha256, byteLength: data.byteLength, bytes: data });
        diagnostic("download", "HTML_downloaded", url.href, String(data.byteLength));
        diagnostic("extraction", "html_text_chars", url.href, String(text.length));
        diagnostic("extraction", "document_retrieved", url.href);
      } else diagnostic("download", "unsupported_media_type", url.href, contentType || "unknown");
    } catch (error) {
      const causeCode = (error as any)?.cause?.code;
      const detail = error instanceof Error ? error.message : String(error);
      diagnostic("download", controller.signal.aborted ? "retrieval_timeout" : "download_error", raw,
        typeof causeCode === 'string' && /^[A-Z0-9_]{1,64}$/.test(causeCode) ? `${detail} (${causeCode})` : detail);
    }
  }
  try {
    for (const candidate of candidates.slice(0, 60)) {
      if (stop()) { diagnostic("limit", "retrieval_limit", candidate.uri); break; }
      await visit(candidate.uri, candidate, true);
    }
    if (candidates.length > 60) diagnostic("limit", "candidate_limit", "", "Only the first 60 candidates considered");
  } finally { clearTimeout(timer); }
  return { documents, diagnostics };
}
