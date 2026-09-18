import fs from "node:fs";
import path from "node:path";
import { mapBmsFactorMetric } from "../src/bms-factor-evidence.ts";

const valueAfter = (prefix: string) => process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
const input = path.resolve(valueAfter("--input=") || "");
const target = path.resolve(valueAfter("--target=")
  || "services/bms-api/src/stock_intelligence/bms_launch_factor_evidence.csv");
if (!input || !fs.existsSync(input)) throw new Error("--input must name an existing evidence CSV");
if (!fs.existsSync(target)) throw new Error(`Target evidence ledger does not exist: ${target}`);

const headers = ["symbol", "factor", "metric_name", "previous_period", "current_period", "previous_value",
  "current_value", "unit", "source_type", "source_ref", "source_date", "cutoff_date", "confidence",
  "previous_source_ref", "current_source_ref"];
const required = headers.slice(0, 13);
const trustedSources = new Set(["company_filing", "company_results", "company_presentation", "company_transcript",
  "nse_filing", "bse_filing", "audited_financial_statement", "quarterly_result", "official_exchange",
  "exchange_filing", "regulator"]);

const parseLine = (line: string) => line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)
  ?.map(value => value.replace(/^,/, "").replace(/^"|"$/g, "").replaceAll('""', '"')) || [];
const read = (file: string) => {
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const sourceHeaders = parseLine(lines.shift() || "");
  const missing = required.filter(header => !sourceHeaders.includes(header));
  if (missing.length) throw new Error(`${file} is missing columns: ${missing.join(", ")}`);
  return lines.filter(Boolean).map(line => {
    const values = parseLine(line);
    return Object.fromEntries(sourceHeaders.map((header, index) => [header, values[index] || ""]));
  });
};
const csv = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const key = (row: Record<string, string>) => {
  const canonicalMetric = mapBmsFactorMetric(row.metric_name)?.metric || row.metric_name;
  return [row.symbol, row.factor, canonicalMetric, row.previous_period, row.current_period]
    .map(value => String(value || "").trim().toLowerCase()).join("|");
};

const existing = read(target);
const incoming = read(input);
const accepted: Record<string, string>[] = [];
const rejected: Array<{ symbol: string; metric: string; reason: string }> = [];
for (const row of incoming) {
  const symbol = String(row.symbol || "").trim().toUpperCase();
  const factor = String(row.factor || "").trim().toLowerCase();
  const metric = String(row.metric_name || "").trim().toLowerCase();
  const mapping = mapBmsFactorMetric(metric);
  const sourceType = String(row.source_type || "").trim().toLowerCase();
  const sourceDate = String(row.source_date || "").trim();
  const cutoffDate = String(row.cutoff_date || "").trim();
  const confidence = Number(row.confidence);
  const numeric = [row.previous_value, row.current_value].every(value => Number.isFinite(Number(value)));
  let reason = "";
  if (!symbol) reason = "missing_symbol";
  else if (!mapping || mapping.factor !== factor) reason = "factor_mapping_mismatch";
  else if (!trustedSources.has(sourceType)) reason = "untrusted_source_type";
  else if (!/^https:\/\//i.test(String(row.source_ref || ""))) reason = "invalid_source_url";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) reason = "invalid_date";
  else if (sourceDate > cutoffDate) reason = "post_cutoff_evidence";
  else if (!numeric) reason = "invalid_numeric_value";
  else if (!String(row.unit || "").trim()) reason = "missing_unit";
  else if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) reason = "invalid_confidence";
  if (reason) rejected.push({ symbol, metric, reason });
  else accepted.push({ ...row, symbol, factor, metric_name: mapping.metric, source_type: sourceType });
}

const merged = new Map(existing.map(row => [key(row), row]));
let inserted = 0;
let upgraded = 0;
for (const row of accepted) {
  const rowKey = key(row);
  const previous = merged.get(rowKey);
  if (!previous) { merged.set(rowKey, row); inserted += 1; continue; }
  if (Number(row.confidence) > Number(previous.confidence || 0)) {
    merged.set(rowKey, { ...previous, ...row });
    upgraded += 1;
  }
}
const outputRows = [...merged.values()].sort((a, b) =>
  String(a.symbol).localeCompare(String(b.symbol)) || String(a.factor).localeCompare(String(b.factor))
  || String(a.metric_name).localeCompare(String(b.metric_name)));
const temp = `${target}.tmp`;
fs.writeFileSync(temp, [headers.join(","), ...outputRows.map(row => headers.map(header => csv(row[header] || "")).join(","))].join("\n") + "\n");
fs.renameSync(temp, target);
const report = { input, target, incomingRows: incoming.length, acceptedRows: accepted.length, rejectedRows: rejected.length,
  inserted, upgraded, unchangedOrDuplicate: accepted.length - inserted - upgraded, totalLedgerRows: outputRows.length,
  symbolsInLedger: new Set(outputRows.map(row => row.symbol)).size,
  rejectionReasons: Object.fromEntries([...new Set(rejected.map(item => item.reason))]
    .map(reason => [reason, rejected.filter(item => item.reason === reason).length])), rejected };
fs.writeFileSync(`${target}.merge-audit.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
