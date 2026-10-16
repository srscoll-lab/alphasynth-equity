import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fundamentalChangeLibrary } from "../src/data/fundamentalChangeLibrary.ts";

type RadarCompany = {
  symbol: string;
  company_name: string;
  radar_state: string;
  experimental_rank_score: number | null;
  data_status: string;
  liquidity_gate?: { qualified: boolean };
  market_cap_segment: { id: string; label: string; industry: string | null };
};

const inputArgument = process.argv.find((argument) => argument.startsWith("--input="));
const urlArgument = process.argv.find((argument) => argument.startsWith("--url="));
const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const publicationsArgument = process.argv.find((argument) => argument.startsWith("--publications="));
const publicationsUrlArgument = process.argv.find((argument) => argument.startsWith("--publications-url="));
if (inputArgument && urlArgument) throw new Error("Use either --input or --url, not both");
if (publicationsArgument && publicationsUrlArgument) throw new Error("Use either --publications or --publications-url, not both");
const inputPath = resolve(inputArgument?.slice("--input=".length) || "src/data/bmsMomentumRadarExpanded.json");
const limit = Number(limitArgument?.slice("--limit=".length) || "2");
if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("--limit must be an integer from 1 to 10");

async function fetchPublicJson(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Public data URL must use HTTPS without embedded credentials");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Public data request failed with HTTP ${response.status}`);
  return response.json();
}

const snapshot = (urlArgument
  ? await fetchPublicJson(urlArgument.slice("--url=".length))
  : JSON.parse(readFileSync(inputPath, "utf8"))) as {
  market_data?: { as_of_date?: string };
  generated_at?: string;
  companies?: RadarCompany[];
};
if (!Array.isArray(snapshot.companies) || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.market_data?.as_of_date || "")) {
  throw new Error("Input must be a dated Momentum Radar snapshot with companies");
}
const snapshotAgeDays = Math.floor((Date.now() - Date.parse(`${snapshot.market_data.as_of_date}T00:00:00Z`)) / 86_400_000);
if (snapshotAgeDays > 7 && !process.argv.includes("--allow-stale")) {
  throw new Error(`Radar snapshot is ${snapshotAgeDays} days old; supply a recent --input file before planning the next company batch`);
}

const existingReports = new Set(fundamentalChangeLibrary.map((record) => record.symbol));
if (publicationsArgument || publicationsUrlArgument) {
  const payload = publicationsUrlArgument
    ? await fetchPublicJson(publicationsUrlArgument.slice("--publications-url=".length))
    : JSON.parse(readFileSync(resolve(publicationsArgument!.slice("--publications=".length)), "utf8"));
  const publications = Array.isArray(payload) ? payload : payload.publications;
  if (!Array.isArray(publications)) throw new Error("--publications must contain an array or a publications array");
  for (const publication of publications) if (typeof publication.symbol === "string") existingReports.add(publication.symbol);
}
const candidates = snapshot.companies
  .filter((company) => !existingReports.has(company.symbol)
    && company.data_status === "full_history"
    && company.liquidity_gate?.qualified === true
    && ["STARTING", "CONFIRMED", "EXTENDED"].includes(company.radar_state)
    && Number.isFinite(company.experimental_rank_score))
  .sort((left, right) => (right.experimental_rank_score ?? 0) - (left.experimental_rank_score ?? 0)
    || left.symbol.localeCompare(right.symbol));

const queue: RadarCompany[] = [];
const sectors = new Set<string>();
const sizes = new Set<string>();
const pool = candidates.slice(0, Math.max(50, limit * 5));
const add = (company: RadarCompany) => {
  queue.push(company);
  sectors.add(company.market_cap_segment.industry || "Unclassified");
  sizes.add(company.market_cap_segment.label);
};
for (const company of pool) {
  if (queue.length >= limit) break;
  const sector = company.market_cap_segment.industry;
  if (sector && !sectors.has(sector) && !sizes.has(company.market_cap_segment.label)) add(company);
}
for (const company of pool) {
  if (queue.length >= limit) break;
  const sector = company.market_cap_segment.industry;
  if (!queue.includes(company) && sector && !sectors.has(sector)) add(company);
}
for (const company of pool) {
  if (queue.length >= limit) break;
  if (!queue.includes(company)) add(company);
}

console.log(JSON.stringify({
  mode: "planning_only",
  radarAsOf: snapshot.market_data.as_of_date,
  snapshotAgeDays,
  snapshotGeneratedAt: snapshot.generated_at || null,
  selection: "High positive Radar ranks without a published FCS report; prefer named sectors and different size categories within the top-ranked pool",
  warning: "Candidates still need official evidence verification. A radar rank never guarantees a publishable FCS or lifecycle. Check live publications before starting work.",
  candidates: queue.map((company) => ({
    symbol: company.symbol,
    companyName: company.company_name,
    sector: company.market_cap_segment.industry || "Unclassified",
    capSegment: company.market_cap_segment.label,
    radarState: company.radar_state,
    radarScore: company.experimental_rank_score,
  })),
}, null, 2));
