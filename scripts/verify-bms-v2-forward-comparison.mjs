import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const comparisonPath = path.join(root, "src", "data", "signalTrackerV2Comparison.json");
const comparison = JSON.parse(fs.readFileSync(comparisonPath, "utf8"));
const manifestPath = path.resolve(root, comparison.sourceManifest.path);
const manifestBuffer = fs.readFileSync(manifestPath);
const manifestHash = crypto.createHash("sha256").update(manifestBuffer).digest("hex");
const failures = [];

if (comparison.cohortId !== "BMS-V2-C50-20260825-RECONSTRUCTED") failures.push("Unexpected cohort ID");
if (comparison.studyType !== "retrospective_reconstruction_with_forward_market_observation") failures.push("Study type must remain explicitly reconstructed");
if (comparison.informationCutoff !== "2026-08-25") failures.push("Information cutoff changed");
if (comparison.marketEntryDate !== "2026-08-26") failures.push("Market entry date changed");
if (comparison.companies.length !== 50) failures.push(`Expected 50 companies; found ${comparison.companies.length}`);
if (new Set(comparison.companies.map((company) => company.symbol)).size !== 50) failures.push("Duplicate company symbols");
if (manifestHash !== comparison.sourceManifest.sha256) failures.push("V2 manifest hash does not match the generated comparison");

for (const company of comparison.companies) {
  if (company.factor_status !== "four_factor_complete") failures.push(`${company.symbol}: not four-factor complete`);
  if (!company.priceHistory.length) failures.push(`${company.symbol}: missing market observations`);
  if (company.priceHistory.some((point) => point.date < comparison.marketEntryDate)) failures.push(`${company.symbol}: pre-entry observation leaked into forward record`);
  if (company.priceHistory.some((point, index, rows) => index > 0 && point.date <= rows[index - 1].date)) failures.push(`${company.symbol}: market dates are not strictly increasing`);
  if (company.lifecycle_publishable === false && company.lifecycle !== "Pending") failures.push(`${company.symbol}: insufficient trajectory must remain lifecycle Pending`);
  if (company.lifecycle === "Pending" && company.lifecycle_status !== "lifecycle_pending_insufficient_v2_trajectory") failures.push(`${company.symbol}: pending lifecycle has an unexpected status`);
}

for (const [id, source] of Object.entries(comparison.benchmarkSources)) {
  if (source.status !== "available" || !comparison.benchmarks[id]?.length) failures.push(`${id}: benchmark unavailable`);
  const observations = comparison.benchmarks[id] || [];
  const minimumCoverage = Math.floor(comparison.forwardSessionsObserved * 0.9);
  if (observations.length < minimumCoverage) failures.push(`${id}: benchmark history covers less than 90% of observed sessions`);
  if (observations.at(-1)?.date !== comparison.asOfDate) failures.push(`${id}: benchmark is stale at the comparison cutoff`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  companies: comparison.companies.length,
  fourFactorComplete: comparison.companies.filter((company) => company.factor_status === "four_factor_complete").length,
  trajectoryBacked: comparison.companies.filter((company) => company.lifecycle_publishable === true).length,
  lifecyclePending: comparison.companies.filter((company) => company.lifecycle_publishable === false).length,
  forwardSessionsObserved: comparison.forwardSessionsObserved,
  asOfDate: comparison.asOfDate,
  manifestSha256: manifestHash,
}, null, 2));
