import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractPdfTextLocally } from "../src/pdf-text.ts";
import { mapBmsFactorMetric } from "../src/bms-factor-evidence.ts";

type Source = {
  url: string;
  publishedAt: string;
  sourceType: string;
  anchors: string[];
};
type Evidence = {
  factor: "execution" | "balance_sheet";
  metricName: string;
  previousValue: number;
  currentValue: number;
  unit: string;
  previousPeriod?: string;
  currentPeriod?: string;
  previousSource: Source;
  currentSource: Source;
};
type Manifest = {
  cutoffDate: string;
  currentPeriod: string;
  companies: Array<{ symbol: string; evidence: Evidence[] }>;
};

const valueAfter = (prefix: string) => process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
const manifestPath = path.resolve(valueAfter("--manifest=") || "scripts/bms-official-document-pilot.json");
const outputPath = path.resolve(valueAfter("--output=") || "output/bms-official-document-pilot.csv");
const archiveDir = path.resolve(valueAfter("--archive-dir=") || "output/bms-official-document-archive");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
const trustedSourceTypes = new Set([
  "company_filing", "company_results", "company_presentation", "company_transcript",
  "nse_filing", "bse_filing", "sec_filing", "audited_financial_statement",
]);

const normalize = (value: string) => value
  .normalize("NFKC")
  .replace(/[\u2010-\u2015]/g, "-")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();
const containsAnchor = (body: string, anchor: string) => {
  const normalizedAnchor = normalize(anchor);
  if (body.includes(normalizedAnchor)) return true;
  // PDF text layers often split grouping punctuation from digits. Preserve
  // strict wording checks while making numeric grouping presentation-neutral.
  if (/\d/.test(normalizedAnchor)) {
    const compact = (value: string) => value.replace(/(?<=\d)[,\s](?=\d)/g, "");
    return compact(body).includes(compact(normalizedAnchor));
  }
  return false;
};
const csv = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const sha256 = (data: Uint8Array) => crypto.createHash("sha256").update(data).digest("hex");
const extensionFor = (url: string, contentType: string) =>
  contentType.includes("pdf") || /\.pdf(?:$|[?#])/i.test(url) ? ".pdf" : ".html";
const htmlToText = (html: string) => html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(archiveDir, { recursive: true });

const sourceCache = new Map<string, Promise<{ text: string; file: string; hash: string; status: number }>>();
async function acquire(source: Source) {
  if (!sourceCache.has(source.url)) {
    sourceCache.set(source.url, (async () => {
      const response = await fetch(source.url, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AlphaSynthEvidenceBot/1.0; +https://alphasynth.ai)",
          Accept: "application/pdf,text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${source.url}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const hash = sha256(bytes);
      const contentType = response.headers.get("content-type") || "";
      const extension = extensionFor(source.url, contentType);
      const file = path.join(archiveDir, `${hash}${extension}`);
      if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
      const text = extension === ".pdf"
        ? await extractPdfTextLocally(bytes, 120)
        : htmlToText(new TextDecoder().decode(bytes));
      fs.writeFileSync(path.join(archiveDir, `${hash}.txt`), text);
      return { text, file, hash, status: response.status };
    })());
  }
  return sourceCache.get(source.url)!;
}

const errors: Array<Record<string, unknown>> = [];
const rows: Array<Record<string, string | number>> = [];
const documents: Array<Record<string, unknown>> = [];
for (const company of manifest.companies) {
  for (const evidence of company.evidence) {
    const mapping = mapBmsFactorMetric(evidence.metricName);
    if (!mapping || mapping.factor !== evidence.factor) {
      errors.push({ symbol: company.symbol, metric: evidence.metricName, error: "factor_mapping_mismatch" });
      continue;
    }
    if (![evidence.previousSource, evidence.currentSource].every(source => trustedSourceTypes.has(source.sourceType))) {
      errors.push({ symbol: company.symbol, metric: evidence.metricName, error: "untrusted_source_type" });
      continue;
    }
    try {
      const previous = await acquire(evidence.previousSource);
      const current = await acquire(evidence.currentSource);
      const checks = [
        { side: "previous", source: evidence.previousSource, acquired: previous },
        { side: "current", source: evidence.currentSource, acquired: current },
      ];
      const failed = checks.flatMap(check => {
        const body = normalize(check.acquired.text);
        const missing = check.source.anchors.filter(anchor => !containsAnchor(body, anchor));
        documents.push({ symbol: company.symbol, metric: evidence.metricName, side: check.side,
          url: check.source.url, publishedAt: check.source.publishedAt, sha256: check.acquired.hash,
          archiveFile: check.acquired.file, anchors: check.source.anchors, missingAnchors: missing });
        return missing.map(anchor => `${check.side}:${anchor}`);
      });
      if (failed.length) {
        errors.push({ symbol: company.symbol, metric: evidence.metricName, error: "anchor_verification_failed", failed });
        continue;
      }
      const sourceDate = [evidence.previousSource.publishedAt, evidence.currentSource.publishedAt].sort().at(-1)!;
      rows.push({
        symbol: company.symbol,
        factor: evidence.factor,
        metric_name: mapping.metric,
        previous_period: evidence.previousPeriod || "Q3 FY25",
        current_period: evidence.currentPeriod || manifest.currentPeriod,
        previous_value: evidence.previousValue,
        current_value: evidence.currentValue,
        unit: evidence.unit,
        source_type: evidence.currentSource.sourceType,
        source_ref: evidence.currentSource.url,
        source_date: sourceDate,
        cutoff_date: manifest.cutoffDate,
        confidence: 0.98,
        previous_source_ref: evidence.previousSource.url,
        current_source_ref: evidence.currentSource.url,
      });
    } catch (error) {
      errors.push({ symbol: company.symbol, metric: evidence.metricName,
        error: error instanceof Error ? error.message : String(error) });
    }
  }
}

const headers = ["symbol", "factor", "metric_name", "previous_period", "current_period", "previous_value",
  "current_value", "unit", "source_type", "source_ref", "source_date", "cutoff_date", "confidence",
  "previous_source_ref", "current_source_ref"];
fs.writeFileSync(outputPath, [headers.join(","), ...rows.map(row => headers.map(header => csv(row[header])).join(","))].join("\n") + "\n");
const qualified = manifest.companies.filter(company => {
  const factors = new Set(rows.filter(row => row.symbol === company.symbol).map(row => row.factor));
  return factors.has("execution") && factors.has("balance_sheet");
}).map(company => company.symbol);
const audit = { manifestPath, outputPath, archiveDir, requestedCompanies: manifest.companies.length,
  producedRows: rows.length, qualifiedForMissingFactors: qualified.length, qualifiedSymbols: qualified,
  errors, documents };
fs.writeFileSync(`${outputPath}.audit.json`, JSON.stringify(audit, null, 2));
console.log(JSON.stringify({ ...audit, documents: documents.length }, null, 2));
if (errors.length) process.exitCode = 2;
