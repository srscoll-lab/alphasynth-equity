// Free-plan batch through the live beta link: one company at a time, request the on-demand
// FCS, wait for the worker to finish, then read the stored job (Firestore, read-only) for the
// result. Stops if a review reports the daily data limit. Writes a JSON + Markdown summary.
// Usage: node scripts/run-beta-fcs-batch.mjs <outDir> SYMBOL:Company Name ...
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const BETA = "https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app";
const FIRESTORE = "https://firestore.googleapis.com/v1/projects/my-nse-research-app/databases/(default)/documents/fundamental_review_jobs_v1/";
const GCLOUD = "C:/Users/admin/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd";
const [outDir, ...items] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const terminal = (s) => ["ready", "score_ready_lifecycle_pending", "incomplete", "failed"].includes(s);
const unwrap = (v) => v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue ?? (v.nullValue !== undefined ? null
  : v.arrayValue ? (v.arrayValue.values || []).map(unwrap) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, unwrap(x)])) : v);

async function storedJob(jobId) {
  const token = execSync(`"${GCLOUD}" auth print-access-token`, { encoding: "utf8" }).trim();
  const r = await fetch(FIRESTORE + jobId, { headers: { Authorization: `Bearer ${token}` } });
  const payload = unwrap((await r.json()).fields.payload);
  return typeof payload === "string" ? JSON.parse(payload) : payload;
}

const results = [];
for (const item of items) {
  const [symbol, ...name] = item.split(":");
  const started = Date.now();
  const req = await fetch(`${BETA}/api/bms/fundamental-review/request`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, company_name: name.join(":") || symbol }) });
  const reqBody = await req.json().catch(() => ({}));
  if (!req.ok) { results.push({ symbol, outcome: `request refused (${req.status})`, message: reqBody.error }); console.log(symbol, "refused", reqBody.error); continue; }
  let job = reqBody.job;
  for (let i = 0; i < 40 && !terminal(job.status); i += 1) {
    await sleep(30_000);
    const s = await fetch(`${BETA}/api/bms/fundamental-review/status/${symbol}`).then((r) => r.json()).catch(() => ({}));
    if (s.job) job = s.job;
  }
  const record = await storedJob(job.jobId).catch(() => null);
  const score = record?.scoreResult || {};
  const diags = record?.diagnostics || [];
  const calls = diags.filter((d) => d.outcome === "tapetide_usage").reduce((n, d) => n + Number(d.network_calls || 0), 0);
  const execution = (score.factors || []).find((f) => f.factor_id === "execution")?.impacts || [];
  const result = {
    symbol, jobId: job.jobId, status: job.status, minutes: Math.round((Date.now() - started) / 6000) / 10, message: job.message,
    fcs: score.fcs_score ?? null, period: score.current_period?.label ?? null,
    lifecycle: score.lifecycle ?? null, lifecycleReason: score.lifecycle_unavailable_reason ?? null,
    checkpoints: (score.checkpoints || []).map((c) => `${c.periodLabel} ${c.fcsScore}`),
    execution: execution.map((i) => `${String(i.current_source_locator?.quoted_label || i.metric_id).split(" — ")[0]} ${i.previous_value}→${i.current_value} ${i.canonical_unit}`),
    remeasured: diags.filter((d) => /remeasured/.test(d.outcome)).map((d) => d.period_end),
    missingFactors: diags.find((d) => d.outcome === "mixed_source_evidence_incomplete")?.missing_factors ?? [],
    tapetideCalls: calls,
    notes: diags.filter((d) => /not_verified|execution_not_comparable|derived_quarter|quota|period_gap/.test(d.outcome)).slice(0, 8).map((d) => d.outcome + (d.detail ? `: ${d.detail}` : "")),
  };
  results.push(result);
  console.log(JSON.stringify(result));
  writeFileSync(`${outDir}/results.json`, JSON.stringify(results, null, 2));
  if (/daily limit/i.test(job.message || "")) { console.log("STOP: daily data limit reached"); break; }
}
const md = ["| Company | Status | FCS | Lifecycle | Checkpoints | Execution measure | Tapetide calls | Notes |", "|---|---|---|---|---|---|---|---|",
  ...results.map((r) => `| ${r.symbol} | ${r.status || r.outcome} | ${r.fcs ?? "—"} ${r.period ?? ""} | ${r.lifecycle ?? (r.lifecycleReason || "—")} | ${(r.checkpoints || []).join(" → ") || "—"} | ${(r.execution || []).join("; ") || (r.missingFactors || []).join(",") || "—"} | ${r.tapetideCalls ?? "—"} | ${[...(r.remeasured?.length ? [`remeasured ${r.remeasured.join(",")}`] : []), ...(r.notes || [])].join("; ").slice(0, 200) || r.message || ""} |`)];
writeFileSync(`${outDir}/results.md`, md.join("\n") + "\n");
console.log("DONE");
