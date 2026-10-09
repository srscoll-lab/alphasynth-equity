import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { PERSISTENT_DEFINITIONS, persistentReviewedPeriods, persistentReviewedQuarterRows } from "../src/persistent-reviewed-quarter-ledger.ts";
import { canonicalizeDynamicEvidence } from "../src/fundamental-review-dynamic-evidence.ts";
import { assessLifecycle, checkpointFromScore } from "../src/fundamental-review-history.ts";

const { scoreFundamentalChangeReview } = await import("../../alphasynth-bms-v2/src/fcs-review-scorer.mjs");
const manifest = JSON.parse(readFileSync("data/official-quarter-cache/manifest.json", "utf8"));
const documents = new Map<string, any>();
for (const period of Object.values(persistentReviewedPeriods) as any[]) {
  const entry = manifest.documents.find((item: any) => item.source_url === period.file);
  assert.ok(entry);
  assert.equal(entry.sha256, period.sha);
  const file = resolve(`data/official-quarter-cache/${entry.sha256}.pdf`);
  assert.ok(readFileSync(file).subarray(0, 5).toString() === "%PDF-");
  documents.set(period.file, { source_ref: period.file, source_date: period.date, document_sha256: period.sha,
    archived_document_uri: pathToFileURL(file).href, media_type: "application/pdf" });
}

const definitions = PERSISTENT_DEFINITIONS.map(definition => ({ factor: definition.factor, metric: definition.metric,
  unit: definition.unit, consolidation_basis: definition.basis,
  comparison_basis: definition.metric === "net_cash" ? "point_in_time_prior_period" : "same_quarter_prior_year" }));
const checkpoints = [];
for (const end of ["2025-12-31", "2026-03-31", "2026-06-30"]) {
  const rows = persistentReviewedQuarterRows(end, "2026-10-09", (url, sha, date) => {
    const document = documents.get(url);
    return document?.document_sha256 === sha && document?.source_date === date ? document : null;
  }, definitions);
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map(row => row.factor)).size, 4);
  assert.equal(persistentReviewedQuarterRows(end, end, () => null).length, 0);
  const evidence = canonicalizeDynamicEvidence({ ticker: "PERSISTENT", company_name: "Persistent Systems Limited", cutoff: "2026-10-09", rows });
  assert.equal(evidence.candidates.length, 4);
  const score = scoreFundamentalChangeReview({ symbol: "PERSISTENT", ...evidence });
  assert.equal(score.score_publishable, true);
  const checkpoint = checkpointFromScore({ symbol: "PERSISTENT", score, documents: evidence.documents,
    informationCutoff: "2026-10-09", calculatedAt: new Date().toISOString(), sourceJobId: "local-persistent-validator" });
  assert.ok(checkpoint); checkpoints.push(checkpoint);
  console.log(JSON.stringify({ period: end, fcs: score.fcs_score, qualified_factors: 4 }));
}
assert.equal(new Set(checkpoints.map(checkpoint => checkpoint.comparabilityKey)).size, 1);
const lifecycle = assessLifecycle(checkpoints, "2026-10-09", new Date().toISOString());
assert.ok(lifecycle);
console.log(JSON.stringify({ mode: "local_replay_not_publication", lifecycle: lifecycle.classification, quarters: 3, original_sources: 6 }));
