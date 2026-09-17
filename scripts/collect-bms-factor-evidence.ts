import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const valueAfter = (prefix: string) => process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
const baseUrl = (valueAfter("--base-url=") || "").replace(/\/$/, "");
const cutoff = valueAfter("--cutoff=") || "";
const selected = new Set((valueAfter("--tickers=") || "").split(",").map(value => value.trim().toUpperCase()).filter(Boolean));
const output = path.resolve(valueAfter("--output=") || "/tmp/bms-factor-evidence.csv");
if (!baseUrl.startsWith("https://")) throw new Error("--base-url must be an HTTPS URL");
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error("--cutoff must be YYYY-MM-DD");
if (!selected.size) throw new Error("--tickers must contain at least one ticker");

const manifest = JSON.parse(fs.readFileSync(path.resolve("scripts/stop-line-universe-companies.json"), "utf8"));
const companies = manifest.companies.filter((company: any) => selected.has(company.ticker));
if (companies.length !== selected.size) throw new Error("One or more tickers are not in the stop-line manifest");
const token = execFileSync("gcloud", ["secrets", "versions", "access", "latest", "--secret=dossier-internal-token", "--project=my-nse-research-app"], { encoding: "utf8" }).trim();
const rows: any[] = [];
const diagnostics: any[] = [];
for (const company of companies) {
  const response = await fetch(`${baseUrl}/api/bms/factor-evidence/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dossier-token": token },
    body: JSON.stringify({
      ticker: company.ticker, company_name: company.company_name, sector: company.sector,
      official_domains: company.official_domains, information_cutoff: cutoff,
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const payload: any = await response.json().catch(() => ({ error: "Non-JSON response" }));
  rows.push(...(Array.isArray(payload.rows) ? payload.rows : []));
  diagnostics.push({ ticker: company.ticker, httpStatus: response.status, error: payload.error || null, rows: payload.rows?.length || 0, evidenceDiagnostics: payload.diagnostics || [] });
  console.log(JSON.stringify(diagnostics.at(-1)));
}
const headers = ["symbol", "factor", "metric_name", "previous_period", "current_period", "previous_value", "current_value", "unit", "source_type", "source_ref", "source_date", "cutoff_date", "confidence"];
const csv = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
fs.writeFileSync(output, [headers.join(","), ...rows.map(row => headers.map(header => csv(row[header])).join(","))].join("\n") + "\n");
const report = {
  cutoff, requestedCompanies: companies.length, admittedCompanies: new Set(rows.map(row => row.symbol)).size,
  rowCount: rows.length, factorCounts: {
    execution: rows.filter(row => row.factor === "execution").length,
    balance_sheet: rows.filter(row => row.factor === "balance_sheet").length,
  }, diagnostics,
};
fs.writeFileSync(output.replace(/\.csv$/i, "-diagnostics.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
