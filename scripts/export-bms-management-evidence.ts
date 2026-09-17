import fs from "node:fs/promises";
import path from "node:path";

type Source = {
  sourceId?: string;
  url?: string;
  publishedAt?: string | null;
  sourceClass?: string;
};

type Statement = {
  commitmentKey?: string;
  statedAt?: string;
  targetDate?: string | null;
  evidenceRefs?: string[];
};

type Delivery = {
  commitmentKey?: string;
  assessedAt?: string;
  status?: "delivered" | "partial" | "missed" | "pending" | "unverifiable";
  evidenceRefs?: string[];
};

const valueAfter = (prefix: string) =>
  process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
const inputDirectory = path.resolve(valueAfter("--input=") || "");
const outputPath = path.resolve(valueAfter("--output=") || "output/bms-management-evidence.csv");
const cutoff = valueAfter("--cutoff=") || "";
const currentPeriod = valueAfter("--current-period=") || "Q3 FY26";

if (!valueAfter("--input=")) throw new Error("--input is required.");
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error("--cutoff must be YYYY-MM-DD.");

const csv = (value: unknown) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const officialSourceType = (source: Source) => {
  const host = new URL(String(source.url)).hostname.toLowerCase();
  if (host === "nseindia.com" || host.endsWith(".nseindia.com")) return "nse_filing";
  if (host === "bseindia.com" || host.endsWith(".bseindia.com")) return "bse_filing";
  return source.sourceClass === "exchange" ? "company_filing" : "company_results";
};
const scoreFor = (status: Delivery["status"]) =>
  status === "delivered" ? 100 : status === "partial" ? 50 : status === "missed" ? 0 : null;
const metricFor = (key: string) => {
  const prefix = key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return `${prefix || "commitment"}_target_delivery`;
};
const latestByKey = <T extends { commitmentKey?: string }>(
  rows: T[], dateFor: (row: T) => string,
) => {
  const selected = new Map<string, T>();
  for (const row of rows) {
    const key = String(row.commitmentKey || "");
    if (!key) continue;
    const prior = selected.get(key);
    if (!prior || dateFor(row) > dateFor(prior)) selected.set(key, row);
  }
  return selected;
};

const headers = [
  "symbol", "factor", "metric_name", "previous_period", "current_period",
  "previous_value", "current_value", "unit", "source_type", "source_ref",
  "source_date", "cutoff_date", "confidence", "previous_source_ref", "current_source_ref",
];
const rows: Record<string, unknown>[] = [];
const diagnostics: Array<Record<string, unknown>> = [];
const files = (await fs.readdir(inputDirectory))
  .filter(file => file.endsWith(".json") && file !== "summary.json")
  .sort();

for (const file of files) {
  const payload = JSON.parse(await fs.readFile(path.join(inputDirectory, file), "utf8"));
  const symbol = String(payload?.dossier?.company?.symbol || payload?.result?.ticker || "").toUpperCase();
  const management = payload?.managementGuidance;
  const assessment = management?.assessment;
  const history = management?.history;
  if (!symbol || management?.status !== "available" || !Number.isFinite(assessment?.score)
    || Number(assessment?.commitmentCounts?.matured || 0) < 3 || !history) {
    diagnostics.push({ symbol, status: "insufficient_history", emittedRows: 0 });
    continue;
  }

  const sourceRows = [
    ...(Array.isArray(payload?.dossier?.sources) ? payload.dossier.sources : []),
    ...(Array.isArray(management?.evidenceDocuments) ? management.evidenceDocuments : []),
  ];
  const sources = new Map<string, Source>(
    sourceRows
      .filter((source: Source) => source.sourceId && source.url && source.publishedAt)
      .map((source: Source) => [String(source.sourceId), source]),
  );
  const statements = latestByKey<Statement>(
    (Array.isArray(history.statements) ? history.statements : [])
      .filter((row: Statement) => String(row.statedAt || "") <= cutoff),
    row => String(row.statedAt || ""),
  );
  const deliveries = latestByKey<Delivery>(
    (Array.isArray(history.delivery) ? history.delivery : [])
      .filter((row: Delivery) => String(row.assessedAt || "") <= cutoff),
    row => String(row.assessedAt || ""),
  );
  const candidates: Record<string, unknown>[] = [];

  for (const [commitmentKey, delivery] of deliveries) {
    const statement = statements.get(commitmentKey);
    const currentValue = scoreFor(delivery.status);
    if (!statement || currentValue === null || !statement.targetDate || statement.targetDate > cutoff) continue;
    const previousSources = (statement.evidenceRefs || []).map(ref => sources.get(ref)).filter(Boolean) as Source[];
    const currentSources = (delivery.evidenceRefs || []).map(ref => sources.get(ref)).filter(Boolean) as Source[];
    const previousSource = previousSources[0];
    const currentSource = currentSources[0];
    if (!previousSource?.url || !currentSource?.url) continue;
    const publishedDates = [...previousSources, ...currentSources]
      .map(source => String(source.publishedAt || ""))
      .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= cutoff)
      .sort();
    if (!publishedDates.length) continue;
    candidates.push({
      symbol,
      factor: "management_delivery",
      metric_name: metricFor(commitmentKey),
      previous_period: `Commitment ${statement.statedAt}`,
      current_period: currentPeriod,
      previous_value: 100,
      current_value: currentValue,
      unit: "/100",
      source_type: officialSourceType(currentSource),
      source_ref: currentSource.url,
      source_date: publishedDates.at(-1),
      cutoff_date: cutoff,
      confidence: 0.85,
      previous_source_ref: previousSource.url,
      current_source_ref: currentSource.url,
    });
  }

  if (candidates.length < 3) {
    diagnostics.push({ symbol, status: "fewer_than_three_matured_sourced_commitments", emittedRows: 0 });
    continue;
  }
  rows.push(...candidates);
  diagnostics.push({ symbol, status: "admitted", emittedRows: candidates.length });
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(
  outputPath,
  `${headers.join(",")}\n${rows.map(row => headers.map(header => csv(row[header])).join(",")).join("\n")}${rows.length ? "\n" : ""}`,
  "utf8",
);
const diagnosticsPath = outputPath.replace(/\.csv$/i, ".diagnostics.json");
await fs.writeFile(diagnosticsPath, `${JSON.stringify({ cutoff, currentPeriod, companies: files.length, admittedRows: rows.length, diagnostics }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, diagnosticsPath, companies: files.length, admittedRows: rows.length }, null, 2));
