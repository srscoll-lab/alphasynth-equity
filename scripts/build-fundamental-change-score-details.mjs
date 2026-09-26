import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const bmsRoot = path.resolve(repoRoot, "..", "alphasynth-bms-v2");

const inputs = [
  ["controlled_pilot_5", "output/five-company-score-candidate.json"],
  ["controlled_expansion_45", "output/fifty-company-expansion-score-gate.json"],
  ["momentum_expansion_5", "output/momentum-expansion-batch1-current-score-gate.json"],
  ["final_build_3", "output/final-build-four-company-score-gate-v1.json"],
];

const documents = await Promise.all(inputs.map(async ([source, relativePath]) => {
  const fullPath = path.join(bmsRoot, relativePath);
  const value = JSON.parse(await readFile(fullPath, "utf8"));
  return { source, relativePath, value };
}));

const weights = documents.find(({ value }) => value.methodology?.frozen_factor_weights)?.value.methodology.frozen_factor_weights
  ?? { earnings: 0.2778, economics: 0.2778, execution: 0.2778, balance_sheet: 0.1666 };

const records = documents.flatMap(({ source, relativePath, value }) => value.companies
  .filter((company) => company.status === undefined || company.status === "score_candidate_ready")
  .filter((company) => Number.isFinite(company.display_score_v2) && Array.isArray(company.factors) && company.factors.length === 4)
  .map((company) => ({
    symbol: company.symbol,
    display_score_v2: company.display_score_v2,
    raw_score: company.raw_score,
    evidence_count: company.evidence_count ?? company.qualified_candidate_count ?? company.factors.reduce((sum, factor) => sum + (factor.evidence_count ?? 0), 0),
    lifecycle_status: company.lifecycle_status ?? "insufficient_v2_trajectory",
    source_gate: source,
    source_artifact: `../alphasynth-bms-v2/${relativePath.replaceAll("\\", "/")}`,
    factors: company.factors.map((factor) => ({
      factor_id: factor.factor_id,
      weight: weights[factor.factor_id],
      score: factor.score,
      contradiction: Boolean(factor.contradiction),
      evidence_count: factor.evidence_count ?? factor.impacts?.length ?? 0,
      strengthens_count: factor.strengthens_count ?? 0,
      weakens_count: factor.weakens_count ?? 0,
      neutral_count: factor.neutral_count ?? 0,
      impacts: (factor.impacts ?? []).map((impact) => ({
        metric_id: impact.metric_id,
        direction: impact.direction,
        previous_value: impact.previous_value ?? impact.derived_metric?.previous_value ?? null,
        current_value: impact.current_value ?? impact.derived_metric?.current_value ?? null,
        canonical_unit: impact.canonical_unit ?? impact.derived_metric?.canonical_unit ?? null,
        change_percentage: impact.change_percentage ?? null,
        css_score: impact.css_score ?? null,
        evidence_confidence: impact.evidence_confidence ?? null,
        comparison_basis: impact.comparison_basis ?? null,
        previous_period: impact.previous_period?.label ?? null,
        current_period: impact.current_period?.label ?? null,
        interpretation: impact.interpretation ?? null,
        document_id: impact.current_document_id ?? impact.previous_document_id ?? null,
        source_page: impact.current_source_locator?.page ?? impact.previous_source_locator?.page ?? null,
        quoted_label: impact.current_source_locator?.quoted_label ?? impact.previous_source_locator?.quoted_label ?? null,
        components: impact.components ?? null,
      })),
    })),
  })));

const duplicates = records.filter((record, index) => records.findIndex((candidate) => candidate.symbol === record.symbol) !== index);
if (duplicates.length) throw new Error(`Duplicate score-detail records: ${duplicates.map(({ symbol }) => symbol).join(", ")}`);
if (records.length !== 58) throw new Error(`Expected 58 score-detail records; found ${records.length}.`);

records.sort((left, right) => left.symbol.localeCompare(right.symbol));

const output = {
  schema_version: "1.0.0",
  methodology_id: "BMS_V2_QUALIFIED_FOUR_FACTOR",
  display_name: "Fundamental Change Score",
  generated_from: inputs.map(([source, source_artifact]) => ({ source, source_artifact: `../alphasynth-bms-v2/${source_artifact}` })),
  factor_weights: weights,
  records,
};

await writeFile(
  path.join(repoRoot, "src", "data", "fundamentalChangeScoreDetails.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${records.length} Fundamental Change score-detail records.`);
