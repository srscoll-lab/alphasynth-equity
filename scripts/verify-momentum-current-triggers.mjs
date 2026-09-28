import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const radarPath = path.resolve("src/data/bmsMomentumRadarExpanded.json");
const cacheRoot = path.resolve("output/momentum-market-cache-expanded");
const radar = JSON.parse(fs.readFileSync(radarPath, "utf8"));
const cutoff = radar.market_data.as_of_date;
const active = radar.companies.filter((company) => company.data_status === "full_history"
  && company.liquidity_gate?.qualified
  && ["STARTING", "CONFIRMED", "EXTENDED"].includes(company.radar_state));

const change = (current, previous) => current / previous - 1;
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const closeEnough = (actual, expected, tolerance = 0.000001) => Math.abs(actual - expected) <= tolerance;

assert.ok(active.length > 0, "No active momentum companies found.");
for (const company of active) {
  const cachePath = path.join(cacheRoot, `${company.yahoo_symbol.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
  const observations = JSON.parse(fs.readFileSync(cachePath, "utf8")).observations
    .filter((point) => point.date <= cutoff && Number.isFinite(point.close))
    .sort((left, right) => left.date.localeCompare(right.date));
  const closes = observations.map((point) => point.close);
  const latest = observations.at(-1);
  const recent5 = observations.slice(-5).filter((point) => Number.isFinite(point.volume) && point.volume > 0).map((point) => point.close * point.volume);
  const prior20 = observations.slice(-25, -5).filter((point) => Number.isFinite(point.volume) && point.volume > 0).map((point) => point.close * point.volume);
  const prior55High = Math.max(...closes.slice(-56, -1));
  const expectedAcceleration = mean(recent5) / mean(prior20);
  const trigger = company.current_momentum_trigger;
  assert.ok(trigger, `${company.symbol}: current trigger missing.`);
  assert.equal(trigger.as_of_date, latest.date, `${company.symbol}: as-of mismatch.`);
  assert.ok(closeEnough(trigger.momentum_20d, change(latest.close, closes.at(-21))), `${company.symbol}: 20-day momentum mismatch.`);
  assert.ok(closeEnough(trigger.momentum_5d, change(latest.close, closes.at(-6))), `${company.symbol}: 5-day momentum mismatch.`);
  assert.ok(closeEnough(trigger.traded_value_acceleration_5_vs_prior_20, expectedAcceleration), `${company.symbol}: traded-value acceleration mismatch.`);
  const expectedBreakout = latest.close > prior55High
    ? expectedAcceleration >= 1.25 ? "CONFIRMED" : "PRICE_ONLY"
    : change(latest.close, prior55High) >= -0.03 ? "NEAR_BREAKOUT" : "NOT_CONFIRMED";
  assert.equal(trigger.breakout_status, expectedBreakout, `${company.symbol}: breakout status mismatch.`);
}

const inactiveWithTrigger = radar.companies.filter((company) => !active.includes(company) && company.current_momentum_trigger !== null);
assert.equal(inactiveWithTrigger.length, 0, "Current triggers should be limited to the active, liquid radar view.");
console.log(JSON.stringify({ cutoff, active_companies_verified: active.length, checks_per_company: 5, result: "pass" }, null, 2));
