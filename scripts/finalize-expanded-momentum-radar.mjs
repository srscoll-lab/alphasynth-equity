import fs from "node:fs";
import path from "node:path";

const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const inputPath = path.resolve(argument("input") || "output/bmsMomentumRadarDailyBase.json");
const seedPath = path.resolve(argument("seed") || "src/data/bmsMomentumRadarExpanded.json");
const outputPath = path.resolve(argument("output") || "output/bmsMomentumRadarDaily.json");
const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
const seedBySymbol = new Map(seed.companies.map((company) => [company.symbol, company]));
const inputSymbols = new Set(input.companies.map((company) => company.symbol));
if (input.companies.length !== seed.companies.length || inputSymbols.size !== seedBySymbol.size
  || seed.companies.some((company) => !inputSymbols.has(company.symbol))) {
  throw new Error("Daily scan does not exactly match the frozen expanded universe; refusing to publish a partial snapshot.");
}

const threshold = Number(seed.selection_gate_policy.minimum_traded_value_inr);
const minCoverage = 0.8;
const minFrequency = Number(seed.selection_gate_policy.minimum_trading_frequency_126);
const criticalFlags = new Set(seed.selection_gate_policy.critical_quality_flags);
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value, digits = 6) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

for (const company of input.companies) {
  const stable = seedBySymbol.get(company.symbol);
  company.market_cap_segment = stable.market_cap_segment;
  const liquidityPass = company.data_status === "full_history"
    && Number(company.median_daily_traded_value_60) >= threshold
    && Number(company.traded_value_coverage_60) >= minCoverage
    && Number(company.trading_frequency_126) >= minFrequency;
  company.liquidity_gate = {
    qualified: liquidityPass,
    metric: "median_daily_traded_value_60",
    observed_value_inr: company.median_daily_traded_value_60 ?? null,
    threshold_inr: threshold,
    traded_value_coverage_60: company.traded_value_coverage_60 ?? null,
    minimum_traded_value_coverage_60: minCoverage,
    trading_frequency_126: company.trading_frequency_126 ?? null,
    minimum_trading_frequency_126: minFrequency,
  };
  const checks = {
    history_pass: company.data_status === "full_history" && company.observations >= 252,
    liquidity_pass: liquidityPass,
    state_pass: ["STARTING", "CONFIRMED"].includes(company.radar_state),
    extension_pass: company.radar_state !== "EXTENDED",
    segment_pass: Boolean(company.market_cap_segment?.id),
    data_quality_pass: !(company.quality_flags || []).some((flag) => criticalFlags.has(flag)),
  };
  company.selection_gate = {
    eligible: Object.values(checks).every(Boolean),
    checks,
    exclusion_reasons: Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => key.replace("_pass", "")),
  };
}

function attachPeerRelative(groupKey, valueKey, benchmarkKey, countKey, label) {
  const groups = new Map();
  for (const company of input.companies) {
    if (company.data_status !== "full_history") continue;
    const group = groupKey(company);
    const blend = Number.isFinite(company.momentum_6_1) && Number.isFinite(company.momentum_3m)
      ? (company.momentum_6_1 + company.momentum_3m) / 2 : null;
    if (!group || !Number.isFinite(blend)) continue;
    const values = groups.get(group) || [];
    values.push({ company, blend });
    groups.set(group, values);
  }
  for (const company of input.companies) {
    company[valueKey] = null;
    company[benchmarkKey] = null;
    company[countKey] = 0;
  }
  for (const [group, entries] of groups) {
    if (entries.length < 5) continue;
    const peerMedian = median(entries.map((entry) => entry.blend));
    for (const { company, blend } of entries) {
      company[valueKey] = round(blend - peerMedian);
      company[benchmarkKey] = label(company, group);
      company[countKey] = entries.length;
    }
  }
}

attachPeerRelative(
  (company) => company.market_cap_segment?.id,
  "relative_strength_to_universe", "universe_benchmark", "universe_peer_count",
  (company) => `${company.market_cap_segment.label.replace("Extended NSE", "Broader NSE")} peer median`,
);
attachPeerRelative(
  (company) => company.market_cap_segment?.industry ? `${company.market_cap_segment.id}::${company.market_cap_segment.industry}` : null,
  "relative_strength_to_sector", "sector_benchmark", "sector_peer_count",
  (company) => `${company.market_cap_segment.industry} · ${company.market_cap_segment.label} peer median`,
);

const segmentIds = [...new Set(input.companies.map((company) => company.market_cap_segment.id))];
const eligible = input.companies.filter((company) => company.selection_gate.eligible);
const qualified = input.companies.filter((company) => company.liquidity_gate.qualified);
input.schema_version = seed.schema_version;
input.policy_id = seed.policy_id;
input.universe = { ...seed.universe, scanned: input.companies.length, expected: input.companies.length, offset: 0 };
input.selection_gate_policy = seed.selection_gate_policy;
input.segment_registry = seed.segment_registry;
input.current_trigger_policy = seed.current_trigger_policy;
input.summary.segment_counts = Object.fromEntries(segmentIds.map((id) => [id, input.companies.filter((company) => company.market_cap_segment.id === id).length]));
input.summary.selection_gate = {
  eligible: eligible.length,
  excluded: input.companies.length - eligible.length,
  eligible_by_segment: Object.fromEntries(segmentIds.map((id) => [id, eligible.filter((company) => company.market_cap_segment.id === id).length])),
};
input.summary.liquidity_universe = {
  qualified: qualified.length,
  excluded: input.companies.length - qualified.length,
  rankable: qualified.filter((company) => company.data_status === "full_history").length,
  metric: "median_daily_traded_value_60",
  threshold_inr: threshold,
  reference_percentile_value_inr: threshold,
  absolute_floor_inr: 50_000_000,
  minimum_trading_frequency_126: minFrequency,
};
input.companies.sort((a, b) => (b.experimental_rank_score ?? -1) - (a.experimental_rank_score ?? -1));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(input, null, 2)}\n`);
fs.renameSync(temporaryPath, outputPath);
console.log(JSON.stringify({ output: outputPath, companies: input.companies.length, qualified: qualified.length, eligible: eligible.length }, null, 2));
