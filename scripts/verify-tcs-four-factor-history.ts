import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { TCS_DEFINITIONS, tcsReviewedPeriods, tcsReviewedQuarterRows } from "../src/tcs-reviewed-quarter-ledger.ts";
import { canonicalizeDynamicEvidence } from "../src/fundamental-review-dynamic-evidence.ts";
import { assessLifecycle, checkpointFromScore } from "../src/fundamental-review-history.ts";
const { scoreFundamentalChangeReview } = await import("../../alphasynth-bms-v2/src/fcs-review-scorer.mjs");
const manifest = JSON.parse(readFileSync("data/official-quarter-cache/manifest.json", "utf8"));
const documents = new Map<string, any>();
for (const period of Object.values(tcsReviewedPeriods) as any[]) {
  const entry = manifest.documents.find((item: any) => item.source_url === period.file);
  assert.ok(entry); assert.equal(entry.sha256, period.sha);
  const file = resolve(`data/official-quarter-cache/${entry.sha256}.pdf`);
  assert.equal(readFileSync(file).subarray(0, 5).toString(), "%PDF-");
  documents.set(period.file, { source_ref: period.file, source_date: period.date, document_sha256: period.sha,
    archived_document_uri: pathToFileURL(file).href, media_type: "application/pdf" });
}
const definitions = TCS_DEFINITIONS.map(d => ({ factor:d.factor, metric:d.metric, unit:d.unit, consolidation_basis:d.basis, comparison_basis:"same_quarter_prior_year" }));
const checkpoints=[];
for (const end of ["2025-12-31","2026-03-31","2026-06-30"]) {
  const rows=tcsReviewedQuarterRows(end,"2026-10-09",(url,sha,date)=>{const document=documents.get(url);return document?.document_sha256===sha&&document?.source_date===date?document:null;},definitions);
  assert.equal(rows.length,4); assert.equal(new Set(rows.map(row=>row.factor)).size,4);
  const evidence=canonicalizeDynamicEvidence({ticker:"TCS",company_name:"Tata Consultancy Services Limited",cutoff:"2026-10-09",rows});
  const score=scoreFundamentalChangeReview({symbol:"TCS",...evidence});assert.equal(score.score_publishable,true);
  const checkpoint=checkpointFromScore({symbol:"TCS",score,documents:evidence.documents,informationCutoff:"2026-10-09",calculatedAt:new Date().toISOString(),sourceJobId:"local-tcs-validator"});
  assert.ok(checkpoint);checkpoints.push(checkpoint);console.log(JSON.stringify({period:end,fcs:score.fcs_score,qualified_factors:4}));
}
assert.equal(new Set(checkpoints.map(c=>c.comparabilityKey)).size,1);
const lifecycle=assessLifecycle(checkpoints,"2026-10-09",new Date().toISOString());assert.ok(lifecycle);
console.log(JSON.stringify({mode:"local_replay_not_publication",lifecycle:lifecycle.classification,quarters:3,original_sources:6}));
