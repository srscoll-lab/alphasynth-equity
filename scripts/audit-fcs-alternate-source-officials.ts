import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { retrieveGroundedFcsDocuments } from "../src/fcs-grounded-document-retrieval.ts";
import { containsReportedNumber, containsReportingPeriod } from "../src/fundamental-review-source-match.ts";

const inputPath = resolve("output/fcs-alternate-source-trial-latest.json");
const outputPath = resolve("output/fcs-alternate-source-official-audit-latest.json");
const trial = JSON.parse(await readFile(inputPath, "utf8"));

const labelPatterns: Record<string, RegExp> = {
  revenue: /\b(?:revenue\s+from\s+operations|total\s+income|sales)\b/i,
  operating_profit: /\b(?:operating\s+profit|profit\s+before\s+exceptional)\b/i,
  operating_margin: /\b(?:operating\s+(?:profit\s+)?margin|OPM)\b/i,
  net_profit: /\b(?:net\s+profit|profit\s+for\s+the\s+period|profit\s+after\s+tax)\b/i,
};

function contextContainsValue(text: string, pattern: RegExp, value: number, unit: string): boolean {
  for (const match of text.matchAll(new RegExp(pattern.source, "ig"))) {
    const nearby = text.slice(Math.max(0, match.index! - 120), Math.min(text.length, match.index! + 1800));
    if (containsReportedNumber(nearby, value)) return true;
    if (/%/.test(unit)) continue;
    // Exchange PDF text extraction sometimes drops a printed decimal separator
    // (for example 23,412.88 becomes 2341288). Compare only within the matching
    // metric-label neighbourhood and allow common crore/million/lakh scales.
    const tokens = [...nearby.matchAll(/\(?\s*[-+]?\d[\d,]*(?:\.\d+)?\s*\)?/g)].map((token) => {
      const negative = token[0].includes("(");
      const parsed = Number(token[0].replace(/[(),\s]/g, ""));
      return negative ? -parsed : parsed;
    }).filter(Number.isFinite);
    const tolerance = Math.max(1.5, Math.abs(value) * 0.0075);
    if (tokens.some((token) => [1, 10, 100, 1000, 10_000].some((scale) => Math.abs(token / scale - value) <= tolerance))) return true;
  }
  return false;
}

const records = [];
for (const record of trial.records) {
  if (!record.latestPeriodEnd || !record.officialResultDocument?.url) {
    records.push({ symbol: record.symbol, status: "not_comparable", reason: "aligned_official_document_missing", matchedMetrics: 0, checkedMetrics: 0 });
    continue;
  }
  const periodTime = Date.parse(`${record.latestPeriodEnd}T00:00:00Z`);
  const publicationTime = Date.parse(`${record.officialResultDocument.publishedAt}T00:00:00Z`);
  if (!(publicationTime >= periodTime && publicationTime <= periodTime + 90 * 86_400_000)) {
    records.push({ symbol: record.symbol, status: "not_comparable", reason: "official_document_period_not_aligned", matchedMetrics: 0, checkedMetrics: 0 });
    continue;
  }
  const retrieved = await retrieveGroundedFcsDocuments(
    [{ uri: record.officialResultDocument.url, title: `${record.symbol} filed financial results` }],
    { trustedIssuerDomains: [], maxDocuments: 1, maxRequests: 3, maximumPages: 60, timeoutMs: 60_000 },
  );
  const document = retrieved.documents[0];
  if (!document) {
    records.push({ symbol: record.symbol, status: "not_comparable", reason: "official_document_unreadable", matchedMetrics: 0, checkedMetrics: 0, diagnostics: retrieved.diagnostics.map((item) => item.code) });
    continue;
  }
  const periodVerified = containsReportingPeriod(document.text, "", record.latestPeriodEnd);
  const checks = record.providerMetrics.map((metric: any) => ({
    metricId: metric.metricId,
    value: metric.value,
    unit: metric.unit,
    labelAndValueFound: Boolean(labelPatterns[metric.metricId]) && contextContainsValue(document.text, labelPatterns[metric.metricId], metric.value, metric.unit),
  }));
  const matchedMetrics = checks.filter((check: any) => check.labelAndValueFound).length;
  records.push({
    symbol: record.symbol,
    status: periodVerified && matchedMetrics >= 2 ? "corroborated" : "needs_manual_review",
    reason: !periodVerified ? "period_not_found_in_official_text" : matchedMetrics < 2 ? "fewer_than_two_provider_values_found_near_matching_official_labels" : null,
    periodVerified,
    matchedMetrics,
    checkedMetrics: checks.length,
    officialSourceUrl: document.sourceUrl,
    checks,
  });
}

const report = {
  schemaVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  methodology: "Provider values are checked for the same reporting period and searched only near matching labels in the linked exchange-filed PDF. INR-crore values allow printed INR-million and INR-lakh scale variants. This is a corroboration test, not FCS publication approval.",
  summary: {
    companies: records.length,
    corroborated: records.filter((record) => record.status === "corroborated").length,
    manualReview: records.filter((record) => record.status === "needs_manual_review").length,
    notComparable: records.filter((record) => record.status === "not_comparable").length,
    updatesFcsScores: false,
  },
  records,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary));
