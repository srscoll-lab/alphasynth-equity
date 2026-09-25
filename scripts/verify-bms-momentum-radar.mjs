import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const input = path.resolve(process.argv.find((value) => value.startsWith("--input="))?.slice(8) || "src/data/bmsMomentumRadar.json");
const radar = JSON.parse(fs.readFileSync(input, "utf8"));

assert.equal(radar.separation_rules.changes_bms_factor_scores, false);
assert.equal(radar.separation_rules.changes_bms_lifecycle, false);
assert.equal(radar.separation_rules.changes_publication_eligibility, false);
assert.equal(radar.universe.scanned, radar.companies.length);
assert.equal(new Set(radar.companies.map((company) => company.symbol)).size, radar.companies.length);
for (const company of radar.companies) {
  assert.ok(["DORMANT", "STARTING", "CONFIRMED", "EXTENDED", "DETERIORATING", "INSUFFICIENT_HISTORY"].includes(company.radar_state), `${company.symbol}: invalid state`);
  if (company.data_status === "full_history") {
    assert.ok(Number.isFinite(company.experimental_rank_score), `${company.symbol}: missing rank`);
    assert.ok(company.experimental_rank_score >= 0 && company.experimental_rank_score <= 100, `${company.symbol}: rank outside range`);
    assert.ok(company.observations >= 252, `${company.symbol}: full-history flag without 252 observations`);
  } else assert.equal(company.experimental_rank_score, null, `${company.symbol}: incomplete history must not receive a rank`);
}
console.log(JSON.stringify({ status: "passed", policy: radar.policy_id, ...radar.universe, ...radar.summary }, null, 2));
