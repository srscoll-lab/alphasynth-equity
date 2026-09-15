import fs from "node:fs/promises";
import path from "node:path";

type FactorId = "earnings" | "economics" | "execution" | "balance_sheet" | "management_delivery";

const definitions: Array<{ id: FactorId; weight: number }> = [
  { id: "earnings", weight: 0.25 },
  { id: "economics", weight: 0.25 },
  { id: "execution", weight: 0.25 },
  { id: "balance_sheet", weight: 0.15 },
  { id: "management_delivery", weight: 0.10 },
];

const argument = (name: string) => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const baseUrl = (argument("--base-url") || process.env.ALPHASYNTH_BASE_URL || "http://127.0.0.1:3005").replace(/\/$/, "");
const limit = Math.max(0, Number(argument("--limit") || 0));
const concurrency = Math.max(1, Math.min(20, Number(argument("--concurrency") || 6)));
const outputPath = path.resolve(argument("--output") || "output/bms-publication-audit.json");

const json = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${body?.error || "request failed"}`);
  return body;
};

const localAssessment = (analysis: any) => {
  const factors = Array.isArray(analysis?.factors) ? analysis.factors : [];
  const completeFactorIds = definitions.flatMap(definition => {
    const factor = factors.find((candidate: any) => candidate?.id === definition.id);
    const previousObserved = factor?.previous?.metrics?.some((metric: any) => metric?.value !== null && metric?.value !== "");
    const currentObserved = factor?.current?.metrics?.some((metric: any) => metric?.value !== null && metric?.value !== "");
    const complete = factor?.availability === "complete"
      && factor?.confidence !== "unavailable"
      && Array.isArray(factor?.evidenceRefs)
      && factor.evidenceRefs.length > 0
      && previousObserved
      && currentObserved;
    return complete ? [definition.id] : [];
  });
  const complete = new Set(completeFactorIds);
  const coverageWeight = Number(definitions.filter(row => complete.has(row.id)).reduce((sum, row) => sum + row.weight, 0).toFixed(2));
  const missingFactorIds = definitions.map(row => row.id).filter(id => !complete.has(id));
  const missingMandatory = (["earnings", "economics"] as FactorId[]).filter(id => !complete.has(id));
  const reasons = [
    ...(completeFactorIds.length < 4 ? [`Only ${completeFactorIds.length} of 5 factors have comparable sourced evidence; at least 4 are required.`] : []),
    ...(coverageWeight < 0.75 ? [`Comparable evidence covers ${Math.round(coverageWeight * 100)}% of model weight; at least 75% is required.`] : []),
    ...(missingMandatory.length ? [`Mandatory factor evidence is missing: ${missingMandatory.join(", ")}.`] : []),
  ];
  return {
    status: reasons.length ? "repair_required" : "eligible",
    scorePublishable: reasons.length === 0,
    completeFactorIds,
    missingFactorIds,
    completeFactorCount: completeFactorIds.length,
    coverageWeight,
    reasons,
  };
};

const universe = await json(`${baseUrl}/api/dossier/companies`);
const selected = (Array.isArray(universe?.companies) ? universe.companies : []).slice(0, limit || undefined);
const results: any[] = [];

for (let offset = 0; offset < selected.length; offset += concurrency) {
  const batch = selected.slice(offset, offset + concurrency);
  results.push(...await Promise.all(batch.map(async (company: any) => {
    const symbol = String(company?.symbol || "").toUpperCase();
    try {
      const payload = await json(`${baseUrl}/api/bms/factor-analysis/${encodeURIComponent(symbol)}`);
      const eligibility = payload?.publication_eligibility || localAssessment(payload?.factor_analysis);
      return { symbol, name: company?.name || symbol, ...eligibility, error: null };
    } catch (error) {
      return {
        symbol,
        name: company?.name || symbol,
        status: "repair_required",
        scorePublishable: false,
        completeFactorIds: [],
        missingFactorIds: definitions.map(row => row.id),
        completeFactorCount: 0,
        coverageWeight: 0,
        reasons: ["Factor evidence could not be retrieved."],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })));
  console.log(`Audited ${Math.min(offset + batch.length, selected.length)} of ${selected.length}`);
}

const eligible = results.filter(row => row.scorePublishable);
const repairQueue = results.filter(row => !row.scorePublishable);
const missingFactorCounts = Object.fromEntries(definitions.map(definition => [
  definition.id,
  repairQueue.filter(row => row.missingFactorIds.includes(definition.id)).length,
]));
const report = {
  schemaVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  baseUrl,
  policy: { minimumCompleteFactors: 4, minimumCoverageWeight: 0.75, mandatoryFactors: ["earnings", "economics"] },
  summary: {
    monitored: results.length,
    eligible: eligible.length,
    repairRequired: repairQueue.length,
    technicalFailures: results.filter(row => row.error).length,
    missingFactorCounts,
  },
  eligible,
  repairQueue,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Publication audit written to ${outputPath}`);

