// Offline: build checkpoints from the saved live current + historical scores
// and run the same lifecycle assessment the worker uses.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { assessLifecycle, checkpointFromScore, mergeCheckpoint, type FcsCheckpoint } from "../src/fundamental-review-history.ts";

const symbol = process.argv[2] || "SOLARINDS";
const cutoff = process.argv[3] || "2026-10-19";
const dir = new URL(`../output/claude-fcs-test-${cutoff.replaceAll("-", "")}/`, import.meta.url);
const files = readdirSync(dir).sort();
const read = (file: string) => JSON.parse(readFileSync(join(dir.pathname.replace(/^\/([A-Za-z]:)/, "$1"), file), "utf8").replace(/^﻿/, ""));
const latestPair = (prefix: string) => {
  const score = files.filter((f) => f.startsWith(prefix) && f.endsWith("-score.json")).at(-1);
  return score ? { score: read(score), evidence: read(score.replace("-score.json", "-evidence.json")), file: score } : null;
};
const runs = [latestPair(`${symbol}-history-2025-12-31-`), latestPair(`${symbol}-history-2026-03-31-`),
  latestPair(`${symbol}-2026`)].filter(Boolean) as Array<{ score: any; evidence: any; file: string }>;

let history: FcsCheckpoint[] = [];
for (const run of runs) {
  const checkpoint = checkpointFromScore({ symbol, score: run.score, informationCutoff: cutoff,
    calculatedAt: new Date().toISOString(), sourceJobId: run.file, documents: run.evidence.documents });
  console.log(`${run.file}\n  publishable ${run.score.score_publishable}  FCS ${run.score.fcs_score ?? "-"}  raw ${run.score.raw_score ?? "-"}  checkpoint ${checkpoint ? `${checkpoint.periodLabel} (${checkpoint.periodEnd})` : "NOT formed"}`);
  if (checkpoint) { console.log(`  comparability ${checkpoint.comparabilityKey.slice(0, 12)}`); history = mergeCheckpoint(history, checkpoint); }
  else if (run.score.score_publishable) for (const f of run.score.factors) console.log(`    ${f.factor_id}: ${f.impacts.map((i: any) => `${i.metric_id} ${i.current_period?.label}/${i.current_period?.end_date} ${i.comparison_basis}`).join("; ")}`);
}
const lifecycle = assessLifecycle(history, cutoff, new Date().toISOString());
console.log(lifecycle
  ? `\nLIFECYCLE: ${lifecycle.classification} (${lifecycle.reason}) through ${lifecycle.latestPeriodEnd}; FCS ${lifecycle.checkpoints.map((c: FcsCheckpoint) => `${c.periodLabel} ${c.fcsScore}`).join(" -> ")}`
  : `\nLIFECYCLE: not formed (${history.length} checkpoint(s); ${new Set(history.map((c) => c.comparabilityKey)).size} comparability key(s))`);
