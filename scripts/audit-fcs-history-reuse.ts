import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { checkpointFromScore, assessLifecycle, type FcsCheckpoint } from "../src/fundamental-review-history.ts";
const { scoreFundamentalChangeReview } = await import("../../alphasynth-bms-v2/src/fcs-review-scorer.mjs");
const outputRoot = resolve("../alphasynth-bms-v2/output");
const symbols = JSON.parse(readFileSync("src/data/fundamentalChangeScoreDetails.json", "utf8")).records.map((r: any) => r.symbol) as string[];
const history = new Map<string, Map<string, FcsCheckpoint>>();
const conflicts = new Set<string>();
const archiveCache = new Map<string, boolean>();
const counts = { reports: 0, archiveFailures: 0, scoreFailures: 0, quarterAdmissionFailures: 0 };
const scoreFailureReasons: Record<string, number> = {};
const quarterAdmissionFailures = new Set<string>();
const quarterFailureMetadata = new Set<string>();
const groups = new Map<string, { candidates: Map<string, any>; documents: Map<string, any>; validations: Map<string, any>; sources: Set<string> }>();
for (const name of readdirSync(outputRoot).filter((name) => /reconstruction.*\.json$/.test(name))) {
  const report = JSON.parse(readFileSync(resolve(outputRoot, name), "utf8"));
  if (!Array.isArray(report.candidates) || !Array.isArray(report.documents) || !Array.isArray(report.validations)) continue;
  counts.reports++;
  for (const candidate of report.candidates) {
    if (!symbols.includes(candidate.company_symbol)) continue;
    const key = `${candidate.company_symbol}|${candidate.current_period?.end_date}`;
    const group = groups.get(key) ?? { candidates: new Map(), documents: new Map(), validations: new Map(), sources: new Set() };
    const signature = JSON.stringify([candidate.factor_id, candidate.canonical_metric_id, candidate.previous_period, candidate.current_period,
      candidate.previous_canonical_value, candidate.current_canonical_value, candidate.canonical_unit,
      candidate.comparison_basis, candidate.previous_consolidation_basis, candidate.current_consolidation_basis,
      candidate.previous_document_id, candidate.current_document_id]);
    if (!group.candidates.has(signature)) {
      const validation = report.validations.find((v: any) => v.candidate_id === candidate.candidate_id);
      if (!["qualified", "qualified_provisional"].includes(validation?.status)) continue;
      const duplicateId = [...group.candidates.values()].find((c) => c.candidate_id === candidate.candidate_id);
      if (duplicateId) { conflicts.add(key); continue; }
      group.candidates.set(signature, candidate);
      group.validations.set(candidate.candidate_id, validation);
    }
    for (const document of report.documents) {
      if ([candidate.previous_document_id, candidate.current_document_id].includes(document.document_id)) group.documents.set(document.document_id, document);
    }
    group.sources.add(name);
    groups.set(key, group);
  }
}
  for (const [groupKey, group] of groups) {
    if (conflicts.has(groupKey)) continue;
    const candidates = [...group.candidates.values()];
    const symbol = candidates[0].company_symbol;
    const documentIds = new Set(candidates.flatMap((c: any) => [c.previous_document_id, c.current_document_id]));
    const documents = [...group.documents.values()].filter((d: any) => documentIds.has(d.document_id));
    const archivesValid = documents.length === documentIds.size && documents.every((d: any) => {
      const key = `${d.archive_uri}|${d.sha256}`;
      if (!archiveCache.has(key)) {
        try {
          // Migration admission requires existing bytes, not just a declared hash.
          const archivePath = d.archive_uri?.startsWith("file:") ? fileURLToPath(d.archive_uri) : resolve("../alphasynth-bms-v2", d.archive_uri || "");
          archiveCache.set(key, /^[a-f0-9]{64}$/.test(d.sha256) && createHash("sha256").update(readFileSync(archivePath)).digest("hex") === d.sha256);
        } catch { archiveCache.set(key, false); }
      }
      return archiveCache.get(key);
    });
    if (!archivesValid) { counts.archiveFailures++; continue; }
    const score = scoreFundamentalChangeReview({ symbol, candidates, documents, validations: [...group.validations.values()] });
    if (!score.score_publishable) {
      counts.scoreFailures++;
      for (const reason of score.reasons ?? []) scoreFailureReasons[reason] = (scoreFailureReasons[reason] ?? 0) + 1;
      continue;
    }
    const cutoff = candidates.map((c: any) => c.information_cutoff?.slice(0, 10)).filter(Boolean).sort().at(-1);
    const checkpoint = checkpointFromScore({ symbol, score, documents, informationCutoff: cutoff,
      calculatedAt: new Date().toISOString(), sourceJobId: `dry-run:${[...group.sources].join(",")}` });
    if (!checkpoint) {
      counts.quarterAdmissionFailures++; quarterAdmissionFailures.add(`${symbol}|${candidates[0].current_period?.end_date}`);
      for (const factor of score.factors) for (const impact of factor.impacts) quarterFailureMetadata.add(JSON.stringify({ label: impact.current_period?.label, basis: impact.comparison_basis, consolidation: impact.consolidation_basis, months: impact.current_period?.duration_months }));
      continue;
    }
    const byPeriod = history.get(symbol) ?? new Map();
    const old = byPeriod.get(checkpoint.periodEnd);
    if (old && (old.evidenceDigest !== checkpoint.evidenceDigest || old.rawScore !== checkpoint.rawScore || old.comparabilityKey !== checkpoint.comparabilityKey)) conflicts.add(`${symbol}|${checkpoint.periodEnd}`);
    else byPeriod.set(checkpoint.periodEnd, checkpoint);
    history.set(symbol, byPeriod);
  }
const assessments = symbols.map((symbol) => {
  const checkpoints = [...(history.get(symbol)?.values() ?? [])].filter((c) => !conflicts.has(`${symbol}|${c.periodEnd}`));
  const lifecycle = assessLifecycle(checkpoints, "2026-10-06", new Date().toISOString());
  return { symbol, reusable_quarters: checkpoints.map((c) => c.periodEnd).sort(), lifecycle: lifecycle?.classification ?? null, lifecycle_as_of: lifecycle?.latestPeriodEnd ?? null };
});
console.log(JSON.stringify({ mode: "read_only_no_migration", companies: symbols.length, ...counts,
  conflicting_quarters: [...conflicts], companies_with_any_reusable_quarter: assessments.filter((a) => a.reusable_quarters.length).length,
  score_failure_reasons: scoreFailureReasons, quarter_admission_failures: [...quarterAdmissionFailures],
  quarter_failure_metadata: [...quarterFailureMetadata],
  companies_with_comparable_triplet: assessments.filter((a) => a.lifecycle),
  companies_without_comparable_triplet: assessments.filter((a) => !a.lifecycle).length,
  publication_note: "No Firestore writes, new research calls, coverage promotions or frozen-validation changes." }, null, 2));
