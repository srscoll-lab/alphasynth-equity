import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataPath = path.join(root, "src", "data", "signalTrackerV2Comparison.json");
const overlayUrl = process.argv.find((value) => value.startsWith("--overlay-url="))?.slice(14)
  || "https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app/api/forward-validation";

const benchmarkSymbols = {
  NIFTY_50: ["^NSEI"],
  NIFTY_500: ["^CRSLDX", "^CNX500"],
  NIFTY_IT: ["^CNXIT"],
  NIFTY_AUTO: ["^CNXAUTO"],
  NIFTY_METAL: ["^CNXMETAL"],
  NIFTY_PHARMA: ["^CNXPHARMA"],
  NIFTY_FIN_SERVICE: ["^CNXFIN"],
  NIFTY_ENERGY: ["^CNXENERGY"],
  NIFTY_INFRA: ["^CNXINFRA"],
  NIFTY_CONSUMPTION: ["^CNXCONSUM"],
};

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 AlphaSynth/2.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&events=div%2Csplits`;
  const body = await fetchJson(url);
  const result = body?.chart?.result?.[0];
  if (!result?.timestamp?.length) throw new Error(`${symbol}: no observations`);
  const quote = result.indicators?.quote?.[0] || {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose || [];
  return result.timestamp.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    close: quote.close?.[index],
    adjustedClose: adjusted[index] ?? quote.close?.[index],
  })).filter((point) => Number.isFinite(point.close) && Number.isFinite(point.adjustedClose));
}

async function fetchWithFallback(symbols) {
  let lastError;
  for (const symbol of symbols) {
    try { return { symbol, observations: await fetchYahoo(symbol) }; }
    catch (error) { lastError = error; }
  }
  throw lastError || new Error(`No observations for ${symbols.join(", ")}`);
}

function validateOverlap(existing, incoming, label) {
  const existingByDate = new Map(existing.map((point) => [point.date, point]));
  const overlaps = incoming.filter((point) => existingByDate.has(point.date));
  if (!overlaps.length) throw new Error(`${label}: no validated overlap with the existing series`);
  const maximumRelativeGap = Math.max(...overlaps.map((point) => {
    const prior = existingByDate.get(point.date);
    return Math.abs(point.adjustedClose / prior.adjustedClose - 1);
  }));
  if (maximumRelativeGap > 0.01) throw new Error(`${label}: overlap mismatch ${(maximumRelativeGap * 100).toFixed(3)}%`);
  return { overlapCount: overlaps.length, maximumRelativeGap };
}

function appendOnly(existing, incoming, cutoff) {
  const lastDate = existing.at(-1)?.date || "";
  const additions = incoming
    .filter((point) => point.date > lastDate && point.date <= cutoff)
    .sort((left, right) => left.date.localeCompare(right.date));
  return [...existing, ...additions];
}

async function main() {
  const originalText = fs.readFileSync(dataPath, "utf8");
  const original = JSON.parse(originalText);
  const updated = structuredClone(original);
  const overlay = await fetchJson(overlayUrl);
  const targetDate = overlay?.benchmarks?.NIFTY_50?.at(-1)?.date;
  if (!targetDate || targetDate <= original.asOfDate) {
    console.log(JSON.stringify({ changed: false, asOfDate: original.asOfDate }, null, 2));
    return;
  }

  const benchmarkReport = [];
  for (const [id, existing] of Object.entries(original.benchmarks)) {
    const overlaySeries = overlay?.benchmarks?.[id] || [];
    const overlap = validateOverlap(existing, overlaySeries, id);
    let merged = appendOnly(existing, overlaySeries, targetDate);
    let yahooSymbol = updated.benchmarkSources[id]?.yahooSymbol || benchmarkSymbols[id]?.[0];
    if (merged.at(-1)?.date < targetDate) {
      const fetched = await fetchWithFallback(benchmarkSymbols[id]);
      yahooSymbol = fetched.symbol;
      const targetPoint = fetched.observations.find((point) => point.date === targetDate);
      if (!targetPoint) throw new Error(`${id}: ${targetDate} observation unavailable`);
      const previous = merged.at(-1);
      if (previous && Math.abs(targetPoint.adjustedClose / previous.adjustedClose - 1) > 0.15) {
        throw new Error(`${id}: implausible one-session move; extension withheld`);
      }
      merged = appendOnly(merged, [targetPoint], targetDate);
    }
    if (merged.at(-1)?.date !== targetDate) throw new Error(`${id}: did not reach ${targetDate}`);
    updated.benchmarks[id] = merged;
    updated.benchmarkSources[id] = {
      ...updated.benchmarkSources[id],
      yahooSymbol,
      status: "available",
      frozenTrackerOverlay: true,
      mergeStatus: "validated_append_only_extension",
      overlapCount: overlap.overlapCount,
      maximumRelativeGap: overlap.maximumRelativeGap,
      comparisonAsOf: targetDate,
    };
    benchmarkReport.push({ id, appended: merged.length - existing.length, asOfDate: merged.at(-1).date });
  }

  const companyResults = await Promise.all(updated.companies.map(async (company, index) => {
    const originalCompany = original.companies[index];
    const fetched = await fetchWithFallback([company.yahooSymbol, `${company.symbol}.NS`, `${company.symbol}.BO`].filter(Boolean));
    const overlap = validateOverlap(originalCompany.priceHistory, fetched.observations, company.symbol);
    const merged = appendOnly(originalCompany.priceHistory, fetched.observations, targetDate);
    if (merged.at(-1)?.date !== targetDate) throw new Error(`${company.symbol}: did not reach ${targetDate}`);
    company.priceHistory = merged;
    company.yahooSymbol = fetched.symbol;
    company.marketDataStatus = "available";
    return {
      symbol: company.symbol,
      appended: merged.length - originalCompany.priceHistory.length,
      overlapCount: overlap.overlapCount,
      maximumRelativeGap: overlap.maximumRelativeGap,
      asOfDate: merged.at(-1).date,
    };
  }));

  updated.asOfDate = targetDate;
  updated.forwardSessionsObserved = updated.benchmarks.NIFTY_50.length;
  updated.generatedAt = new Date().toISOString();

  for (let index = 0; index < original.companies.length; index += 1) {
    const before = original.companies[index];
    const after = updated.companies[index];
    for (const field of ["symbol", "raw_score", "display_score_v2", "lifecycle", "lifecycle_status", "frozen_lifecycle_v1"]) {
      if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) throw new Error(`${before.symbol}: frozen field changed: ${field}`);
    }
    if (JSON.stringify(before.priceHistory) !== JSON.stringify(after.priceHistory.slice(0, before.priceHistory.length))) {
      throw new Error(`${before.symbol}: prior price history changed`);
    }
  }

  fs.writeFileSync(dataPath, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(JSON.stringify({
    changed: true,
    previousAsOfDate: original.asOfDate,
    asOfDate: targetDate,
    forwardSessionsObserved: updated.forwardSessionsObserved,
    companiesUpdated: companyResults.length,
    benchmarkReport,
    companyResults,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
