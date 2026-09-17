import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bms-factor-evidence-"));
const output = path.join(directory, "evidence.csv");
const dossier = {
  schemaVersion: "1.0.0",
  reportId: "TEST-1",
  generatedAt: "2026-09-10T00:00:00Z",
  company: { symbol: "TEST", name: "Test Ltd", exchange: "NSE", sector: "Industrials", officialDomains: ["example.com"] },
  sections: { snapshot: [], developments: [], operatingEvidence: [], managementCommitments: [], risks: [] },
  quarterlyPerformance: [], qualityEvidence: [],
  factorEvidence: [{
    factor: "execution", metricName: "capacity_utilization", previousPeriod: "Q1 FY26",
    currentPeriod: "Q1 FY27", previousValue: 70, currentValue: 76, unit: "%",
    sourceIds: ["s1"], confidence: 0.85,
  }],
  sources: [{
    sourceId: "s1", url: "https://example.com/q1-results.pdf", sourceClass: "company_official",
    publishedAt: "2026-08-10", retrievedAt: "2026-09-10T00:00:00Z",
  }],
  marketConversation: { status: "disabled", affectsBms: false, sampleSize: 0, sentiment: { positive: 0, neutral: 1, negative: 0 }, themes: [] },
  qualityControl: { unsupportedClaims: 0, conflicts: 0, humanReviewRequired: true },
};
fs.writeFileSync(path.join(directory, "TEST.json"), JSON.stringify({ dossier }));
execFileSync(process.execPath, [
  "--import", "tsx", "scripts/export-bms-factor-evidence.ts",
  `--input=${directory}`, `--output=${output}`, "--cutoff=2026-09-11",
], { cwd: path.resolve("."), stdio: "pipe" });
const csv = fs.readFileSync(output, "utf8");
assert.match(csv, /TEST,execution,capacity_utilization,Q1 FY26,Q1 FY27,70,76,%,company_filing/);
const diagnostics = JSON.parse(fs.readFileSync(output.replace(".csv", "-diagnostics.json"), "utf8"));
assert.equal(diagnostics.rowCount, 1);
assert.equal(diagnostics.factorCounts.execution, 1);
console.log("PASS: BMS factor-evidence exporter preserves sourced comparable measurements");
