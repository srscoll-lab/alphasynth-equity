import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const policyPath = path.resolve("../alphasynth-bms-v2/config/momentum-radar-policy-v1.json");
const universePath = path.resolve("services/bms-api/nifty500_bms_v1_product_view_final.csv");
const outputPath = path.resolve(arg("output") || "src/data/bmsMomentumRadar.json");
const concurrency = Number(arg("concurrency") || 8);
const limit = Number(arg("limit") || 0);
const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [headers, ...data] = rows;
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const round = (value, digits = 6) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const standardDeviation = (values) => {
  if (values.length < 2) return null;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};
const change = (current, previous) => Number.isFinite(current) && Number.isFinite(previous) && previous !== 0
  ? current / previous - 1
  : null;

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y&events=div%2Csplits`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 AlphaSynth-Momentum-Radar/1.0" },
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      const result = body?.chart?.result?.[0];
      if (!result?.timestamp?.length) throw new Error(body?.chart?.error?.description || "no observations");
      const quote = result.indicators?.quote?.[0] || {};
      const adjusted = result.indicators?.adjclose?.[0]?.adjclose || [];
      const observations = result.timestamp.map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        close: adjusted[index] ?? quote.close?.[index],
        volume: quote.volume?.[index],
      })).filter((point) => Number.isFinite(point.close));
      if (!observations.length) throw new Error("no finite adjusted-close observations");
      return observations;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
    }
  }
  throw lastError;
}

function observationAtOrBefore(observations, date) {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    if (observations[index].date <= date) return observations[index];
  }
  return null;
}

function benchmarkReturn(benchmark, observations, lag) {
  if (observations.length <= lag) return null;
  const currentDate = observations.at(-1).date;
  const previousDate = observations.at(-(lag + 1)).date;
  return change(observationAtOrBefore(benchmark, currentDate)?.close, observationAtOrBefore(benchmark, previousDate)?.close);
}

function featuresFor(company, observations, benchmark) {
  const closes = observations.map((point) => point.close);
  const volumes = observations.map((point) => Number.isFinite(point.volume) ? point.volume : null);
  const latest = observations.at(-1);
  const current = latest.close;
  const returns = closes.slice(1).map((value, index) => change(value, closes[index])).filter(Number.isFinite);
  const sma50 = mean(closes.slice(-50));
  const sma200 = mean(closes.slice(-200));
  const avgVolume20 = mean(volumes.slice(-20).filter(Number.isFinite));
  const avgVolume60 = mean(volumes.slice(-60).filter(Number.isFinite));
  const momentum12_1 = observations.length >= 253 ? change(closes.at(-22), closes.at(-253)) : null;
  const momentum6_1 = observations.length >= 127 ? change(closes.at(-22), closes.at(-127)) : null;
  const momentum3m = observations.length >= 64 ? change(current, closes.at(-64)) : null;
  const momentum1m = observations.length >= 22 ? change(current, closes.at(-22)) : null;
  const benchmark6_1 = observations.length >= 127
    ? change(observationAtOrBefore(benchmark, observations.at(-22).date)?.close, observationAtOrBefore(benchmark, observations.at(-127).date)?.close)
    : null;
  const benchmark3m = benchmarkReturn(benchmark, observations, 63);
  const relativeStrength = Number.isFinite(momentum6_1) && Number.isFinite(benchmark6_1) && Number.isFinite(momentum3m) && Number.isFinite(benchmark3m)
    ? ((momentum6_1 - benchmark6_1) + (momentum3m - benchmark3m)) / 2
    : null;
  const high252 = Math.max(...closes.slice(-252));
  const trendStructure = observations.length >= 200
    ? Number(current > sma50) / 3 + Number(sma50 > sma200) / 3 + Number(current > sma200) / 3
    : null;
  const averageTradedValue20 = mean(observations.slice(-20).filter((point) => Number.isFinite(point.volume)).map((point) => point.close * point.volume));
  return {
    symbol: company.symbol,
    company_name: company.company_name,
    yahoo_symbol: `${company.symbol}.NS`,
    observations: observations.length,
    first_date: observations[0].date,
    as_of_date: latest.date,
    adjusted_close: round(current, 4),
    momentum_12_1: round(momentum12_1),
    momentum_6_1: round(momentum6_1),
    momentum_3m: round(momentum3m),
    momentum_1m: round(momentum1m),
    nifty500_6_1: round(benchmark6_1),
    nifty500_3m: round(benchmark3m),
    relative_strength: round(relativeStrength),
    sma_50: round(sma50, 4),
    sma_200: round(sma200, 4),
    trend_structure: round(trendStructure),
    distance_from_sma50: round(change(current, sma50)),
    distance_from_52w_high: round(change(current, high252)),
    high_proximity: round(current / high252),
    volume_confirmation: round(Number.isFinite(avgVolume20) && Number.isFinite(avgVolume60) && avgVolume60 > 0 ? Math.min(avgVolume20 / avgVolume60, 3) : null),
    average_traded_value_20: round(averageTradedValue20, 0),
    annualized_volatility_63: round(standardDeviation(returns.slice(-63)) * Math.sqrt(252)),
    data_status: observations.length >= policy.market_data.minimum_full_history_sessions ? "full_history" : observations.length >= policy.market_data.minimum_partial_history_sessions ? "partial_history" : "insufficient_history",
  };
}

function assignPercentiles(companies, feature) {
  const available = companies.filter((company) => company.data_status === "full_history" && Number.isFinite(company[feature]))
    .sort((left, right) => left[feature] - right[feature]);
  available.forEach((company, index) => {
    company.percentiles ||= {};
    company.percentiles[feature] = available.length === 1 ? 0.5 : index / (available.length - 1);
  });
}

function classify(company) {
  if (company.data_status !== "full_history") return "INSUFFICIENT_HISTORY";
  const confirmed = company.adjusted_close > company.sma_50
    && company.sma_50 > company.sma_200
    && company.momentum_6_1 > 0
    && company.relative_strength > 0;
  const extensionThreshold = Math.max(0.12, 2.5 * (company.annualized_volatility_63 / Math.sqrt(252)) * Math.sqrt(20));
  if (confirmed && company.distance_from_sma50 >= extensionThreshold) return "EXTENDED";
  if (confirmed) return "CONFIRMED";
  if (company.adjusted_close > company.sma_200 && company.momentum_1m > 0 && company.relative_strength > 0) return "STARTING";
  if ((company.adjusted_close < company.sma_200 && company.relative_strength < 0) || company.momentum_3m < -0.1) return "DETERIORATING";
  return "DORMANT";
}

async function mapConcurrent(items, worker, size) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

async function main() {
  const universeRows = parseCsv(fs.readFileSync(universePath, "utf8"));
  const deduplicated = [...new Map(universeRows.map((row) => [row.symbol, { symbol: row.symbol, company_name: row.company_name }])).values()];
  if (deduplicated.length !== policy.universe.expected_companies) throw new Error(`Universe contains ${deduplicated.length}, expected ${policy.universe.expected_companies}`);
  const selected = limit > 0 ? deduplicated.slice(0, limit) : deduplicated;
  let benchmark;
  let benchmarkSymbol;
  for (const symbol of ["^CRSLDX", "^CNX500"]) {
    try { benchmark = await fetchYahoo(symbol); benchmarkSymbol = symbol; break; } catch (error) { console.warn(`${symbol}: ${error.message}`); }
  }
  if (!benchmark) throw new Error("Nifty 500 benchmark unavailable");
  let completed = 0;
  const fetched = await mapConcurrent(selected, async (company) => {
    try {
      const observations = await fetchYahoo(`${company.symbol}.NS`);
      return featuresFor(company, observations, benchmark);
    } catch (error) {
      return { symbol: company.symbol, company_name: company.company_name, yahoo_symbol: `${company.symbol}.NS`, data_status: "provider_unavailable", error: String(error?.message || error) };
    } finally {
      completed += 1;
      if (completed % 25 === 0 || completed === selected.length) console.log(`Momentum radar: ${completed}/${selected.length}`);
    }
  }, concurrency);

  const featureIds = policy.features.map((feature) => feature.id);
  for (const feature of featureIds) assignPercentiles(fetched, feature);
  for (const company of fetched) {
    if (company.data_status === "full_history") {
      company.experimental_rank_score = round(policy.features.reduce((sum, feature) => sum + (company.percentiles?.[feature.id] ?? 0) * feature.weight, 0) * 100, 2);
    } else company.experimental_rank_score = null;
    company.radar_state = classify(company);
    company.quality_flags = [];
    if (company.data_status === "partial_history" || company.data_status === "insufficient_history") company.quality_flags.push("partial_history");
    if (company.data_status === "provider_unavailable") company.quality_flags.push("provider_unavailable");
    if (Number.isFinite(company.average_traded_value_20) && company.average_traded_value_20 < 10_000_000) company.quality_flags.push("illiquid");
    if (Number.isFinite(company.annualized_volatility_63) && company.annualized_volatility_63 > 0.6) company.quality_flags.push("high_volatility");
  }
  fetched.sort((left, right) => (right.experimental_rank_score ?? -1) - (left.experimental_rank_score ?? -1));
  const stateCounts = Object.fromEntries(policy.states.map((state) => [state, fetched.filter((company) => company.radar_state === state).length]));
  const output = {
    schema_version: "1.0.0",
    policy_id: policy.policy_id,
    generated_at: new Date().toISOString(),
    status: selected.length === policy.universe.expected_companies ? "complete_universe_scan" : "partial_test_scan",
    purpose: policy.purpose,
    caveat: policy.ranking.note,
    separation_rules: policy.separation_rules,
    universe: { expected: policy.universe.expected_companies, scanned: selected.length },
    market_data: { provider: policy.market_data.provisional_provider, price_basis: policy.market_data.price_basis, benchmark: "NIFTY_500", benchmark_symbol: benchmarkSymbol, as_of_date: benchmark.at(-1).date },
    summary: {
      full_history: fetched.filter((company) => company.data_status === "full_history").length,
      partial_history: fetched.filter((company) => company.data_status === "partial_history").length,
      insufficient_history: fetched.filter((company) => company.data_status === "insufficient_history").length,
      provider_unavailable: fetched.filter((company) => company.data_status === "provider_unavailable").length,
      state_counts: stateCounts,
    },
    companies: fetched,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ output: outputPath, ...output.universe, ...output.summary }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
