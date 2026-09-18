import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const valueAfter = (prefix: string) => process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
const baseUrl = (valueAfter("--base-url=") || "").replace(/\/$/, "");
const cutoff = valueAfter("--cutoff=") || "";
const selected = new Set((valueAfter("--tickers=") || "").split(",").map(value => value.trim().toUpperCase()).filter(Boolean));
const allUniverse = process.argv.includes("--all");
const offset = Math.max(0, Number(valueAfter("--offset=") || 0));
const limit = allUniverse ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.min(100, Number(valueAfter("--limit=") || 25)));
const requestTimeoutMs = Math.max(30_000, Number(valueAfter("--request-timeout-ms=") || 360_000));
const maxAttempts = Math.max(1, Math.min(5, Number(valueAfter("--max-attempts=") || 3)));
const retryDelayMs = Math.max(1_000, Number(valueAfter("--retry-delay-ms=") || 5_000));
const concurrency = Math.max(1, Math.min(5, Number(valueAfter("--concurrency=") || 3)));
const output = path.resolve(valueAfter("--output=") || "/tmp/bms-factor-evidence.csv");
if (!baseUrl.startsWith("https://")) throw new Error("--base-url must be an HTTPS URL");
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error("--cutoff must be YYYY-MM-DD");

const manifest = JSON.parse(fs.readFileSync(path.resolve("scripts/stop-line-universe-companies.json"), "utf8"));
const reviewedByTicker = new Map(manifest.companies.map((company: any) => [company.ticker, company]));
const universeResponse = await fetch(`${baseUrl}/api/dossier/companies`, { signal: AbortSignal.timeout(30_000) });
const universe: any = await universeResponse.json().catch(() => ({}));
if (!universeResponse.ok || !Array.isArray(universe.companies)) {
  throw new Error(`Unable to load monitored company universe (HTTP ${universeResponse.status})`);
}
const universeByTicker = new Map(universe.companies.map((company: any) => [String(company.symbol).toUpperCase(), company]));
let companies: any[];
if (selected.size) {
  companies = [...selected].map(ticker => {
    const reviewed: any = reviewedByTicker.get(ticker);
    const monitored: any = universeByTicker.get(ticker);
    return reviewed ? { ...reviewed, publication_eligibility: monitored?.publication_eligibility } : {
      ticker,
      company_name: monitored?.name || ticker,
      sector: monitored?.sector || "Unclassified",
      official_domains: [],
      publication_eligibility: monitored?.publication_eligibility,
    };
  }).filter((company: any) => company?.publication_eligibility?.scorePublishable !== true);
} else {
  companies = universe.companies
    .filter((company: any) => company?.publication_eligibility?.scorePublishable !== true)
    .slice(offset, offset + limit)
    .map((company: any) => {
      const reviewed: any = reviewedByTicker.get(String(company.symbol).toUpperCase());
      return reviewed ? { ...reviewed, publication_eligibility: company.publication_eligibility } : {
        ticker: String(company.symbol).toUpperCase(),
        company_name: company.name || company.symbol,
        sector: company.sector || "Unclassified",
        official_domains: [],
        publication_eligibility: company.publication_eligibility,
      };
    });
}
if (!companies.length) throw new Error("The selected repair batch is empty");
const secretArgs = ["secrets", "versions", "access", "latest", "--secret=dossier-internal-token", "--project=my-nse-research-app"];
const token = process.env.DOSSIER_INTERNAL_TOKEN?.trim() || (process.platform === "win32"
  ? execFileSync("cmd.exe", ["/d", "/s", "/c", "gcloud.cmd", ...secretArgs], { encoding: "utf8" }).trim()
  : execFileSync("gcloud", secretArgs, { encoding: "utf8" }).trim());
const rows: any[] = [];
const diagnostics: any[] = [];
const headers = ["symbol", "factor", "metric_name", "previous_period", "current_period", "previous_value", "current_value", "unit", "source_type", "source_ref", "source_date", "cutoff_date", "confidence"];
const csv = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const diagnosticsOutput = output.replace(/\.csv$/i, "-diagnostics.json");
if (fs.existsSync(output)) {
  const existing = fs.readFileSync(output, "utf8").trim().split(/\r?\n/).slice(1);
  for (const line of existing) {
    const values = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)?.map(value => value.replace(/^,/, "").replace(/^"|"$/g, "").replaceAll('""', '"')) || [];
    if (values.length === headers.length) rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index]])));
  }
}
if (fs.existsSync(diagnosticsOutput)) {
  try {
    const existing = JSON.parse(fs.readFileSync(diagnosticsOutput, "utf8"));
    diagnostics.push(...(Array.isArray(existing?.diagnostics) ? existing.diagnostics : []));
  } catch { /* a partial diagnostics file is safe to ignore */ }
}
const completedTickers = new Set(diagnostics
  .filter(item => Number(item?.rows || 0) > 0
    && (item?.completed === true || (item?.httpStatus >= 200 && item?.httpStatus < 300 && !item?.error)))
  .map(item => String(item?.ticker || "").toUpperCase()).filter(Boolean));
const buildReport = () => ({
  cutoff,
  monitoredUniverse: universe.companies.length,
  requestedCompanies: companies.length,
  completedCompanies: companies.filter(company => completedTickers.has(company.ticker)).length,
  remainingCompanies: companies.filter(company => !completedTickers.has(company.ticker)).length,
  retryableFailures: diagnostics.filter(item => item?.retryable === true).length,
  admittedCompanies: new Set(rows.map(row => row.symbol)).size,
  rowCount: rows.length,
  factorCounts: {
    earnings: rows.filter(row => row.factor === "earnings").length,
    economics: rows.filter(row => row.factor === "economics").length,
    execution: rows.filter(row => row.factor === "execution").length,
    balance_sheet: rows.filter(row => row.factor === "balance_sheet").length,
  },
  diagnostics,
});
const checkpoint = () => {
  const csvTemp = `${output}.tmp`;
  const diagnosticsTemp = `${diagnosticsOutput}.tmp`;
  fs.writeFileSync(csvTemp, [headers.join(","), ...rows.map(row => headers.map(header => csv(row[header])).join(","))].join("\n") + "\n");
  fs.writeFileSync(diagnosticsTemp, JSON.stringify(buildReport(), null, 2));
  fs.renameSync(csvTemp, output);
  fs.renameSync(diagnosticsTemp, diagnosticsOutput);
};

const processCompany = async (company: any) => {
  if (completedTickers.has(company.ticker)) {
    console.log(JSON.stringify({ ticker: company.ticker, skipped: true, reason: "already_checkpointed" }));
    return;
  }
  let result: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/bms/factor-evidence/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dossier-token": token },
        body: JSON.stringify({
          ticker: company.ticker, company_name: company.company_name, sector: company.sector,
          official_domains: company.official_domains,
          missing_factor_ids: company?.publication_eligibility?.missingFactorIds || ["execution", "balance_sheet"],
          information_cutoff: cutoff,
        }),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const payload: any = await response.json().catch(() => ({ error: "Non-JSON response" }));
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      result = { ticker: company.ticker, attempt, httpStatus: response.status, error: payload.error || null,
        rows: payload.rows?.length || 0, evidenceDiagnostics: payload.diagnostics || [],
        completed: response.ok, retryable };
      if (response.ok) {
        rows.push(...(Array.isArray(payload.rows) ? payload.rows : []));
        completedTickers.add(company.ticker);
        break;
      }
      if (!retryable || attempt === maxAttempts) break;
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "TimeoutError";
      result = { ticker: company.ticker, attempt, httpStatus: 0,
        error: timeout ? `Timed out after ${Math.round(requestTimeoutMs / 1000)} seconds` : (error instanceof Error ? error.message : String(error)),
        rows: 0, evidenceDiagnostics: [], completed: false, retryable: true };
      if (attempt === maxAttempts) break;
    }
    await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
  }
  const priorIndex = diagnostics.findIndex(item => String(item?.ticker || "").toUpperCase() === company.ticker);
  if (priorIndex >= 0) diagnostics.splice(priorIndex, 1, result);
  else diagnostics.push(result);
  console.log(JSON.stringify(result));
  checkpoint();
};
const pendingCompanies = companies.filter(company => !completedTickers.has(company.ticker));
let nextCompany = 0;
const workers = Array.from({ length: Math.min(concurrency, pendingCompanies.length) }, async () => {
  while (nextCompany < pendingCompanies.length) {
    const company = pendingCompanies[nextCompany];
    nextCompany += 1;
    await processCompany(company);
  }
});
await Promise.all(workers);
const report = buildReport();
console.log(JSON.stringify(report, null, 2));
