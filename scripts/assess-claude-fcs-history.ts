// Offline: from saved live traces, align Execution across the three quarters
// (fcs-segment-alignment), rescore each quarter with the authoritative scorer,
// build checkpoints and run the same lifecycle assessment as the worker.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { assessLifecycle, balanceSheetPeriodAllowed, checkpointFromScore, mergeCheckpoint, type FcsCheckpoint } from "../src/fundamental-review-history.ts";
import { alignExecutionAcrossQuarters, type QuarterEvidence } from "../src/fcs-segment-alignment.ts";
// @ts-ignore Plain ESM scorer in the sibling repository.
import { scoreFundamentalChangeReview as scorer } from "../../alphasynth-bms-v2/src/fcs-review-scorer.mjs";
const score = scorer as unknown as (input: Record<string, unknown>) => Record<string, any>;

const cutoff = process.argv[3] || "2026-10-22";
const symbols = (process.argv[2] || "SOLARINDS").split(",");
const dir = new URL(`../output/claude-fcs-test-${cutoff.replaceAll("-", "")}/`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = readdirSync(dir).sort();
const read = (file: string) => JSON.parse(readFileSync(join(dir, file), "utf8").replace(/^﻿/, ""));

for (const symbol of symbols) {
  const targets: Array<[string, RegExp]> = [["2025-12-31", new RegExp(`^${symbol}-history-2025-12-31-.*-evidence\\.json$`)],
    ["2026-03-31", new RegExp(`^${symbol}-history-2026-03-31-.*-evidence\\.json$`)], ["2026-06-30", new RegExp(`^${symbol}-20.*-evidence\\.json$`)]];
  const quarters: QuarterEvidence[] = [];
  for (const [periodEnd, pattern] of targets) {
    const file = files.filter((f) => pattern.test(f)).at(-1);
    if (!file) continue;
    const e = read(file);
    const candidates = e.candidates.filter((c: any) => c.factor_id === "balance_sheet"
      ? balanceSheetPeriodAllowed(periodEnd, c.current_period.end_date) : c.current_period.end_date === periodEnd);
    const ids = new Set(candidates.map((c: any) => c.candidate_id));
    quarters.push({ periodEnd, candidates, documents: e.documents, validations: e.validations.filter((v: any) => ids.has(v.candidate_id)) });
  }
  console.log(`\n===== ${symbol} (${quarters.length} quarters with traces)`);
  const scoreAll = (qs: QuarterEvidence[]) => qs.map((q) => ({ q, s: score({ symbol, candidates: q.candidates, documents: q.documents, validations: q.validations }) }));
  const raw = scoreAll(quarters);
  for (const { q, s } of raw) console.log(`  raw     ${q.periodEnd}: ${s.score_publishable ? `FCS ${s.fcs_score}` : `not published (missing ${(s.missing_factors || []).join(",")})`}`);
  const publishable = raw.filter(({ s }) => s.score_publishable).map(({ q }) => q);
  if (publishable.length < 3) { console.log(`  LIFECYCLE: not possible — ${publishable.length}/3 quarters publish all four factors`); continue; }
  const alignment = alignExecutionAcrossQuarters(publishable);
  if (!alignment.aligned) { console.log(`  LIFECYCLE: not possible — ${alignment.reason} ${JSON.stringify(alignment.segmentsByQuarter)}`); continue; }
  console.log(`  aligned Execution on: ${alignment.measure}${alignment.segments.length ? ` [${alignment.segments.join(" | ")}]` : ""}`);
  let history: FcsCheckpoint[] = [];
  for (const { q, s } of scoreAll(alignment.quarters)) {
    const checkpoint = s.score_publishable ? checkpointFromScore({ symbol, score: s, informationCutoff: cutoff, calculatedAt: "t", sourceJobId: "offline", documents: q.documents }) : null;
    console.log(`  aligned ${q.periodEnd}: ${s.score_publishable ? `FCS ${s.fcs_score}` : "not published"} checkpoint ${checkpoint ? `${checkpoint.periodLabel} key ${checkpoint.comparabilityKey.slice(0, 10)}` : "NOT formed"}`);
    if (checkpoint) history = mergeCheckpoint(history, checkpoint);
  }
  const lifecycle = assessLifecycle(history, cutoff, new Date().toISOString());
  console.log(lifecycle ? `  LIFECYCLE: ${lifecycle.classification} (${lifecycle.reason}); FCS ${lifecycle.checkpoints.map((c) => `${c.periodLabel} ${c.fcsScore}`).join(" → ")}`
    : `  LIFECYCLE: not formed (${history.length} checkpoints, ${new Set(history.map((c) => c.comparabilityKey)).size} keys)`);
}
