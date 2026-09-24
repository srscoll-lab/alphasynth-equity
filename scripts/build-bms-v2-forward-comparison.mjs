import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.resolve(
  process.argv.find((value) => value.startsWith("--manifest="))?.slice(11)
    || "../alphasynth-bms-v2/output/fifty-company-v2-release-manifest.json",
);
const outputPath = path.resolve(
  process.argv.find((value) => value.startsWith("--output="))?.slice(9)
    || "src/data/signalTrackerV2Comparison.json",
);
const signalDate = "2026-08-25";
const marketEntryDate = "2026-08-26";

const benchmarkDefinitions = {
  NIFTY_50: { label: "Nifty 50", yahoo: ["^NSEI"] },
  NIFTY_500: { label: "Nifty 500", yahoo: ["^CRSLDX", "^CNX500"] },
  NIFTY_IT: { label: "Nifty IT", yahoo: ["^CNXIT"] },
  NIFTY_AUTO: { label: "Nifty Auto", yahoo: ["^CNXAUTO"] },
  NIFTY_METAL: { label: "Nifty Metal", yahoo: ["^CNXMETAL"] },
  NIFTY_PHARMA: { label: "Nifty Pharma", yahoo: ["^CNXPHARMA"] },
  NIFTY_FIN_SERVICE: { label: "Nifty Financial Services", yahoo: ["^CNXFIN"] },
  NIFTY_ENERGY: { label: "Nifty Energy", yahoo: ["^CNXENERGY"] },
  NIFTY_INFRA: { label: "Nifty Infrastructure", yahoo: ["^CNXINFRA"] },
  NIFTY_CONSUMPTION: { label: "Nifty India Consumption", yahoo: ["^CNXCONSUM"] },
};

const sectorBenchmark = {
  APTUS: "NIFTY_FIN_SERVICE", BAJFINANCE: "NIFTY_FIN_SERVICE", HOMEFIRST: "NIFTY_FIN_SERVICE",
  MUTHOOTFIN: "NIFTY_FIN_SERVICE", PNBHOUSING: "NIFTY_FIN_SERVICE", SUNDARMFIN: "NIFTY_FIN_SERVICE",
  CANFINHOME: "NIFTY_FIN_SERVICE", LTF: "NIFTY_FIN_SERVICE", ICICIAMC: "NIFTY_FIN_SERVICE",
  POONAWALLA: "NIFTY_FIN_SERVICE", CHOLAFIN: "NIFTY_FIN_SERVICE", SHRIRAMFIN: "NIFTY_FIN_SERVICE",
  FIVESTAR: "NIFTY_FIN_SERVICE", CREDITACC: "NIFTY_FIN_SERVICE", MANAPPURAM: "NIFTY_FIN_SERVICE",
  CIPLA: "NIFTY_PHARMA", DRREDDY: "NIFTY_PHARMA", SUNPHARMA: "NIFTY_PHARMA",
  HINDALCO: "NIFTY_METAL", JSWSTEEL: "NIFTY_METAL", TATASTEEL: "NIFTY_METAL", HINDZINC: "NIFTY_METAL",
  IOC: "NIFTY_ENERGY", BPCL: "NIFTY_ENERGY", HINDPETRO: "NIFTY_ENERGY", RELIANCE: "NIFTY_ENERGY", NTPC: "NIFTY_ENERGY",
  HCLTECH: "NIFTY_IT", COFORGE: "NIFTY_IT", PERSISTENT: "NIFTY_IT", TECHM: "NIFTY_IT",
  INFY: "NIFTY_IT", TCS: "NIFTY_IT", WIPRO: "NIFTY_IT",
  "BAJAJ-AUTO": "NIFTY_AUTO", "M&M": "NIFTY_AUTO", TMCV: "NIFTY_AUTO",
  SUZLON: "NIFTY_INFRA", POLYCAB: "NIFTY_INFRA", BEL: "NIFTY_INFRA", LT: "NIFTY_INFRA",
  ADANIENSOL: "NIFTY_INFRA", ULTRACEMCO: "NIFTY_INFRA", SHREECEM: "NIFTY_INFRA", GRASIM: "NIFTY_INFRA",
  TITAN: "NIFTY_CONSUMPTION", TRENT: "NIFTY_CONSUMPTION", PIDILITIND: "NIFTY_CONSUMPTION",
};

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function unix(date) {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
}

async function fetchYahoo(symbol) {
  const period1 = unix("2026-08-25");
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}&events=div%2Csplits`;
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 AlphaSynth/2.0" } });
  if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`);
  const body = await response.json();
  const result = body?.chart?.result?.[0];
  if (!result?.timestamp?.length) throw new Error(`${symbol}: no observations`);
  const quote = result.indicators?.quote?.[0] || {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose || [];
  return result.timestamp.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    close: quote.close?.[index],
    adjustedClose: adjusted[index] ?? quote.close?.[index],
  })).filter((point) => point.date >= marketEntryDate && Number.isFinite(point.close) && Number.isFinite(point.adjustedClose));
}

async function fetchWithFallback(symbols) {
  let lastError;
  for (const symbol of symbols) {
    try {
      const observations = await fetchYahoo(symbol);
      if (observations.length) return { yahooSymbol: symbol, observations };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`No market data for ${symbols.join(", ")}`);
}

async function main() {
  const manifestBuffer = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  const equities = JSON.parse(fs.readFileSync(path.join(root, "nse_equities.json"), "utf8"));
  const names = new Map(equities.map((company) => [company.s, company.n]));

  const requiredBenchmarkIds = [...new Set([
    "NIFTY_50",
    ...manifest.companies.map((company) => sectorBenchmark[company.symbol] || "NIFTY_500"),
  ])];
  const benchmarks = {};
  const benchmarkSources = {};
  for (const id of requiredBenchmarkIds) {
    const definition = benchmarkDefinitions[id];
    try {
      const fetched = await fetchWithFallback(definition.yahoo);
      benchmarks[id] = fetched.observations;
      benchmarkSources[id] = { label: definition.label, yahooSymbol: fetched.yahooSymbol, status: "available" };
    } catch (error) {
      if (id === "NIFTY_50") throw error;
      benchmarks[id] = [];
      benchmarkSources[id] = { label: definition.label, yahooSymbol: null, status: "unavailable", error: String(error?.message || error) };
    }
  }

  const companies = [];
  for (const company of manifest.companies) {
    let market;
    try {
      market = await fetchWithFallback([`${company.symbol}.NS`, `${company.symbol}.BO`]);
    } catch (error) {
      companies.push({
        ...company,
        name: names.get(company.symbol) || company.symbol,
        lifecycle: company.lifecycle[0] + company.lifecycle.slice(1).toLowerCase(),
        sectorBenchmarkId: sectorBenchmark[company.symbol] || "NIFTY_500",
        sectorBenchmarkLabel: benchmarkDefinitions[sectorBenchmark[company.symbol] || "NIFTY_500"].label,
        marketDataStatus: "unavailable",
        marketDataError: String(error?.message || error),
        entryDate: null,
        entryPrice: null,
        priceHistory: [],
      });
      continue;
    }
    const first = market.observations[0];
    companies.push({
      ...company,
      name: names.get(company.symbol) || company.symbol,
      lifecycle: company.lifecycle[0] + company.lifecycle.slice(1).toLowerCase(),
      sectorBenchmarkId: sectorBenchmark[company.symbol] || "NIFTY_500",
      sectorBenchmarkLabel: benchmarkDefinitions[sectorBenchmark[company.symbol] || "NIFTY_500"].label,
      marketDataStatus: "available",
      yahooSymbol: market.yahooSymbol,
      entryDate: first?.date || null,
      entryPrice: first?.adjustedClose ?? null,
      priceHistory: market.observations,
    });
  }

  const niftyDates = benchmarks.NIFTY_50.map((point) => point.date);
  const asOfDate = niftyDates.at(-1) || marketEntryDate;
  const output = {
    schemaVersion: "1.0.0",
    cohortId: "BMS-V2-C50-20260825-RECONSTRUCTED",
    baseReleasePolicyId: manifest.release_policy_id,
    methodologyId: "BMS_V2_OPTION_C_FOUR_FACTOR",
    studyType: "retrospective_reconstruction_with_forward_market_observation",
    informationCutoff: manifest.information_cutoff,
    classificationCalculatedAt: manifest.generated_at,
    signalDate,
    marketEntryRule: "First completed Indian trading session strictly after the information cutoff",
    marketEntryDate,
    asOfDate,
    forwardSessionsObserved: niftyDates.length,
    generatedAt: new Date().toISOString(),
    sourceManifest: {
      path: path.relative(root, manifestPath).replaceAll("\\", "/"),
      sha256: sha256(manifestBuffer),
    },
    integrityNotice: "The V2 classifications were calculated after the cutoff using only evidence available by the cutoff. Returns are genuine subsequent market observations, but this is a reconstructed shadow study—not a contemporaneously frozen prospective signal.",
    summary: manifest.summary,
    companies,
    benchmarks,
    benchmarkSources,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({
    output: outputPath,
    companies: companies.length,
    marketDataAvailable: companies.filter((company) => company.marketDataStatus === "available").length,
    trajectoryBacked: companies.filter((company) => !company.lifecycle_status.startsWith("provisional_watch")).length,
    asOfDate,
    forwardSessionsObserved: niftyDates.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
