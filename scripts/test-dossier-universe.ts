import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { isResearchDossier } from "../src/dossier.ts";

type PilotCompany = {
  ticker: string;
  company_name: string;
  official_domains: string[];
  exchange: string;
  sector: string;
};

const candidateUrl = "https://dossier-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app/api/dossier/research-evidence";
const cutoffArg = process.argv.find((arg) => arg.startsWith("--cutoff="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const tickerArg = process.argv.find((arg) => arg.startsWith("--ticker="));
const listOnly = process.argv.includes("--list");
const cutoff = cutoffArg?.slice("--cutoff=".length) || new Date().toISOString().slice(0, 10);
const limit = Number(limitArg?.slice("--limit=".length) || 0);
const selectedTicker = tickerArg?.slice("--ticker=".length).toUpperCase();

if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error("--cutoff must be YYYY-MM-DD");
if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a non-negative integer");

const manifestPath = path.join(process.cwd(), "scripts", "dossier-pilot-companies.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PilotCompany[];
let companies = selectedTicker
  ? manifest.filter((company) => company.ticker === selectedTicker)
  : manifest;
if (selectedTicker && companies.length === 0) throw new Error(`Unknown pilot ticker: ${selectedTicker}`);
if (limit > 0) companies = companies.slice(0, limit);

if (listOnly) {
  console.log(JSON.stringify({ cutoff, companies }, null, 2));
  process.exit(0);
}

const token = execFileSync("gcloud", [
  "secrets", "versions", "access", "latest",
  "--secret=dossier-internal-token",
  "--project=my-nse-research-app",
], { encoding: "utf8" }).trim();

const outputDirectory = `/tmp/dossier-universe-${cutoff.replaceAll("-", "")}`;
fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
const results: Array<Record<string, unknown>> = [];

for (const company of companies) {
  const started = Date.now();
  try {
    const response = await fetch(candidateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-dossier-token": token },
      signal: AbortSignal.timeout(300000),
      body: JSON.stringify({
        ...company,
        information_cutoff: cutoff,
        social_affects_bms: false,
      }),
    });
    const text = await response.text();
    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      result = { error: "Non-JSON response", responsePreview: text.slice(0, 300) };
    }
    const output = path.join(outputDirectory, `${company.ticker}.json`);
    fs.writeFileSync(output, JSON.stringify(result, null, 2), { mode: 0o600 });
    const valid = response.status === 200 && isResearchDossier(result);
    const sources = Array.isArray(result.sources) ? result.sources : [];
    const claims = result.sections ? Object.values(result.sections).flat().length : 0;
    const sourceDatesValid = sources.every((source: any) =>
      typeof source.publishedAt === "string" && source.publishedAt <= cutoff);
    const marketSafe = result.marketConversation?.affectsBms === false;
    const reviewFlagged = result.qualityControl?.humanReviewRequired === true;
    results.push({
      ticker: company.ticker,
      pass: valid && sources.length > 0 && claims > 0 && sourceDatesValid && marketSafe && reviewFlagged,
      httpStatus: response.status,
      seconds: Math.round((Date.now() - started) / 1000),
      sources: sources.length,
      claims,
      sourceDatesValid,
      marketSafe,
      reviewFlagged,
      conflicts: result.qualityControl?.conflicts,
      unsupportedClaims: result.qualityControl?.unsupportedClaims,
      error: result.error,
      candidateCount: result.diagnostics?.candidateCount,
      rejectionReasons: result.diagnostics?.rejectionReasons,
      output,
    });
  } catch (error: any) {
    results.push({
      ticker: company.ticker,
      pass: false,
      seconds: Math.round((Date.now() - started) / 1000),
      error: error?.message || String(error),
    });
  }
  console.log(JSON.stringify(results.at(-1)));
}

const summary = {
  cutoff,
  tested: results.length,
  passed: results.filter((result) => result.pass).length,
  failed: results.filter((result) => !result.pass).length,
  outputDirectory,
  results,
};
fs.writeFileSync(path.join(outputDirectory, "summary.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0) process.exitCode = 1;
