import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const radarPath = path.resolve(argument("radar") || "src/data/bmsMomentumRadarExpanded.json");
const cacheRoot = path.resolve(argument("cache") || "output/momentum-market-cache-expanded");

function argument(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

const round = (value, digits = 6) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const change = (current, previous) => Number.isFinite(current) && Number.isFinite(previous) && previous !== 0
  ? current / previous - 1
  : null;

function observationsFor(company, cutoff) {
  const cachePath = path.join(cacheRoot, `${company.yahoo_symbol.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
  if (!fs.existsSync(cachePath)) return [];
  const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  return (cached.observations || [])
    .filter((point) => point.date <= cutoff && Number.isFinite(point.close))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function currentTrigger(observations) {
  if (observations.length < 56) return null;
  const latest = observations.at(-1);
  const closes = observations.map((point) => point.close);
  const previous55 = closes.slice(-56, -1);
  const prior55High = Math.max(...previous55);
  const recent5TradedValues = observations.slice(-5)
    .filter((point) => Number.isFinite(point.volume) && point.volume > 0)
    .map((point) => point.close * point.volume);
  const prior20TradedValues = observations.slice(-25, -5)
    .filter((point) => Number.isFinite(point.volume) && point.volume > 0)
    .map((point) => point.close * point.volume);
  const recent5Average = mean(recent5TradedValues);
  const prior20Average = mean(prior20TradedValues);
  const tradedValueAcceleration = Number.isFinite(recent5Average) && Number.isFinite(prior20Average) && prior20Average > 0
    ? recent5Average / prior20Average
    : null;
  const priceBreakout = latest.close > prior55High;
  const volumeConfirmed = Number.isFinite(tradedValueAcceleration) && tradedValueAcceleration >= 1.25;
  const distanceFromBreakout = change(latest.close, prior55High);
  const breakoutStatus = priceBreakout && volumeConfirmed
    ? "CONFIRMED"
    : priceBreakout
      ? "PRICE_ONLY"
      : Number.isFinite(distanceFromBreakout) && distanceFromBreakout >= -0.03
        ? "NEAR_BREAKOUT"
        : "NOT_CONFIRMED";

  return {
    as_of_date: latest.date,
    momentum_20d: round(change(latest.close, closes.at(-21))),
    momentum_5d: round(change(latest.close, closes.at(-6))),
    traded_value_acceleration_5_vs_prior_20: round(tradedValueAcceleration),
    breakout_status: breakoutStatus,
  };
}

const radar = JSON.parse(fs.readFileSync(radarPath, "utf8"));
const cutoff = radar.market_data?.as_of_date || radar.market_data?.requested_as_of_date;
let enriched = 0;
let unavailable = 0;

for (const company of radar.companies) {
  const eligibleForTrigger = company.data_status === "full_history"
    && company.liquidity_gate?.qualified;
  const trigger = eligibleForTrigger ? currentTrigger(observationsFor(company, cutoff)) : null;
  company.current_momentum_trigger = trigger;
  if (trigger) enriched += 1;
  else unavailable += 1;
}

radar.current_trigger_policy = {
  version: "1.1.0",
  score_separation: "Current triggers are displayed separately and do not alter the experimental momentum rank, radar state, FCS or lifecycle.",
  coverage: "All liquidity-qualified companies with full price history, including positive, neutral and negative price-direction views.",
  momentum_windows: {
    medium_term: "12-month and 6-month returns ending one month before the as-of date",
    current: "20-session and 5-session returns ending on the latest completed session",
  },
  volume_acceleration: "Recent 5-session average traded value divided by the preceding 20-session average traded value",
  breakout_confirmation: "Close above the prior 55-session high with traded-value acceleration of at least 1.25x",
};

fs.writeFileSync(radarPath, `${JSON.stringify(radar, null, 2)}\n`);
console.log(JSON.stringify({ radar: radarPath, cutoff, enriched, unavailable }, null, 2));
