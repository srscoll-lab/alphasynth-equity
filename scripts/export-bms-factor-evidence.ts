import fs from "node:fs";
import path from "node:path";
import { isResearchDossier, type ResearchDossier } from "../src/dossier.ts";

const valueAfter = (prefix: string) => process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
const inputDirectory = path.resolve(valueAfter("--input=") || "");
const outputFile = path.resolve(valueAfter("--output=") || path.join(inputDirectory, "bms-factor-evidence.csv"));
const cutoff = valueAfter("--cutoff=") || "";

if (!inputDirectory || !fs.existsSync(inputDirectory)) throw new Error("--input must name an existing stop-line output directory");
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error("--cutoff must be YYYY-MM-DD");

const csv = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const sourceType = (url: string, sourceClass: string) => {
  let hostname = "";
  try { hostname = new URL(url).hostname.toLowerCase(); } catch { return null; }
  if (hostname.endsWith("nseindia.com")) return "nse_filing";
  if (hostname.endsWith("bseindia.com")) return "bse_filing";
  if (sourceClass === "company_official") return "company_filing";
  return null;
};

const rows: Array<Record<string, string | number>> = [];
const diagnostics: Array<Record<string, unknown>> = [];
for (const filename of fs.readdirSync(inputDirectory).filter(name => name.endsWith(".json") && name !== "summary.json")) {
  const document = JSON.parse(fs.readFileSync(path.join(inputDirectory, filename), "utf8"));
  const dossier: ResearchDossier | undefined = document?.dossier;
  if (!isResearchDossier(dossier)) {
    diagnostics.push({ file: filename, status: "invalid_or_missing_dossier" });
    continue;
  }
  let accepted = 0;
  for (const evidence of dossier.factorEvidence || []) {
    const source = dossier.sources.find(item => evidence.sourceIds.includes(item.sourceId)
      && item.publishedAt && item.publishedAt <= cutoff);
    if (!source) continue;
    const admittedSourceType = sourceType(source.url, source.sourceClass);
    if (!admittedSourceType) continue;
    rows.push({
      symbol: dossier.company.symbol,
      factor: evidence.factor,
      metric_name: evidence.metricName,
      previous_period: evidence.previousPeriod,
      current_period: evidence.currentPeriod,
      previous_value: evidence.previousValue,
      current_value: evidence.currentValue,
      unit: evidence.unit || "",
      source_type: admittedSourceType,
      source_ref: source.url,
      source_date: source.publishedAt!,
      cutoff_date: cutoff,
      confidence: evidence.confidence,
    });
    accepted += 1;
  }
  diagnostics.push({
    ticker: dossier.company.symbol,
    status: accepted ? "accepted" : "no_admissible_factor_evidence",
    accepted,
    execution: rows.filter(row => row.symbol === dossier.company.symbol && row.factor === "execution").length,
    balance_sheet: rows.filter(row => row.symbol === dossier.company.symbol && row.factor === "balance_sheet").length,
  });
}

const headers = [
  "symbol", "factor", "metric_name", "previous_period", "current_period",
  "previous_value", "current_value", "unit", "source_type", "source_ref", "source_date",
  "cutoff_date", "confidence",
];
fs.writeFileSync(outputFile, [headers.join(","), ...rows.map(row => headers.map(header => csv(row[header])).join(","))].join("\n") + "\n");
fs.writeFileSync(outputFile.replace(/\.csv$/i, "-diagnostics.json"), JSON.stringify({
  inputDirectory, cutoff, rowCount: rows.length,
  companyCount: new Set(rows.map(row => row.symbol)).size,
  factorCounts: {
    execution: rows.filter(row => row.factor === "execution").length,
    balance_sheet: rows.filter(row => row.factor === "balance_sheet").length,
  },
  diagnostics,
}, null, 2));
console.log(JSON.stringify({ outputFile, rows: rows.length, companies: new Set(rows.map(row => row.symbol)).size }, null, 2));
