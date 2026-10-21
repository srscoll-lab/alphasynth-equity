// Offline summary of the Phase A cohort from the saved per-company traces.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const cutoff = process.argv[2] || "2026-10-21";
const symbols = (process.argv[3] || "HAL,EICHERMOT,KPITTECH,GLENMARK,MARICO,HAVELLS,SRF,KEC,SANSERA,CPPLUS").split(",");
const dir = join(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "output", `claude-fcs-test-${cutoff.replaceAll("-", "")}`);
const files = readdirSync(dir).sort();
const read = (file: string) => JSON.parse(readFileSync(join(dir, file), "utf8").replace(/^﻿/, ""));
const rows: any[] = [];
for (const symbol of symbols) {
  const scoreFile = files.filter((f) => f.startsWith(`${symbol}-2026`) && f.endsWith("-score.json")).at(-1);
  if (!scoreFile) { rows.push({ symbol, status: "NO TRACE" }); continue; }
  const score = read(scoreFile), evidence = read(scoreFile.replace("-score.json", "-evidence.json"));
  const diagnostics: any[] = evidence.diagnostics || [];
  const count = (pattern: RegExp) => diagnostics.filter((d) => pattern.test(String(d.outcome || ""))).length;
  const tokens = diagnostics.filter((d) => d.outcome === "factor_extraction_completed").reduce((sum, d) => sum + (d.total_token_count || 0), 0);
  const rejections = diagnostics.filter((d) => d.metric && d.outcome && d.outcome !== "admitted")
    .map((d) => `${d.metric}:${d.outcome}`);
  const factors = [...new Set((evidence.candidates || []).map((c: any) => c.factor_id))];
  rows.push({
    symbol,
    status: score.score_publishable ? `FCS ${score.fcs_score}` : "not published",
    period: (evidence.candidates || []).find((c: any) => c.factor_id === "earnings")?.current_period?.label ?? "-",
    factors: factors.join("+") || "-",
    missing: (score.missing_factors || []).join("+") || "-",
    execution: (evidence.candidates || []).filter((c: any) => c.factor_id === "execution").map((c: any) => c.canonical_metric_id).join("+") || "-",
    balance_sheet: (evidence.candidates || []).filter((c: any) => c.factor_id === "balance_sheet").map((c: any) => c.canonical_metric_id).join("+") || "-",
    rejections: [...new Set(rejections)].slice(0, 4).join("; ") || "-",
    ocr: count(/^ocr_(completed|cache_hit)$/),
    model_tokens: tokens,
    tapetide_calls: count(/^tapetide_tool_completed$/),
    firecrawl_searches: diagnostics.filter((d) => d.outcome === "firecrawl_official_url_discovery").reduce((s, d) => s + (d.search_calls || 0), 0),
  });
}
console.table(rows.map(({ rejections, ...rest }) => rest));
for (const row of rows) if (row.rejections && row.rejections !== "-") console.log(`${row.symbol} rejections: ${row.rejections}`);
const published = rows.filter((row) => String(row.status).startsWith("FCS")).length;
console.log(`\nPublished: ${published}/${rows.length}`);
