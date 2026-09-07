import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { isResearchDossier } from "../src/dossier";

const webhook = process.argv.includes("--webhook");
const url = webhook
  ? "https://34-170-67-37.sslip.io/webhook-test/alphasynth-dossier-orchestrator-v1"
  : "https://dossier-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app/api/dossier/research-evidence";
const headers: Record<string, string> = { "Content-Type": "application/json" };
if (!webhook) headers["x-dossier-token"] = execFileSync("gcloud", ["secrets", "versions", "access", "latest", "--secret=dossier-internal-token", "--project=my-nse-research-app"], { encoding: "utf8" }).trim();
const started = Date.now();
const response = await fetch(url, {
  method: "POST", headers, signal: AbortSignal.timeout(300000),
  body: JSON.stringify({ ticker: "RADICO", company_name: "Radico Khaitan Limited", information_cutoff: "2026-09-05", official_domains: ["radicokhaitan.com"], exchange: "NSE", sector: "Alcoholic Beverages", social_affects_bms: false }),
});
const body = await response.text();
const result = JSON.parse(body);
const output = `/tmp/dossier-${webhook ? "webhook" : "direct"}-20260907.json`;
fs.writeFileSync(output, JSON.stringify(result, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ httpStatus: response.status, seconds: Math.round((Date.now() - started) / 1000), output, error: result.error, diagnostics: result.diagnostics, sources: result.sources, claims: Object.fromEntries(Object.entries(result.sections || {}).map(([name, claims]) => [name, (claims as any[]).length])), qualityControl: result.qualityControl }, null, 2));
assert.equal(response.status, 200);
assert.ok(isResearchDossier(result));
assert.equal(result.company.symbol, "RADICO");
assert.ok(result.sources.length >= 1);
assert.ok(result.sources.every(s => s.publishedAt && s.publishedAt <= "2026-09-05"));
assert.ok(Object.values(result.sections).flat().length > 0);
assert.equal(result.marketConversation.affectsBms, false);
assert.equal(result.qualityControl.humanReviewRequired, true);
console.log(`PASS: ${webhook ? "full n8n webhook" : "candidate API"} returned a nonempty, source-cited dossier.`);
