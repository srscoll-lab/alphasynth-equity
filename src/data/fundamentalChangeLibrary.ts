import expandedRadarData from "./bmsMomentumRadarExpanded.json";
import momentumExpansionStudies from "./momentumExpansionStudies.json";
import signalTrackerV2Comparison from "./signalTrackerV2Comparison.json";
import finalBuildFcsScores from "./finalBuildFcsScores.json";

export type FundamentalChangeRecord = {
  symbol: string;
  companyName: string;
  sector: string;
  capSegment: string;
  fcsScore: number;
  fcsPeriod: string;
  fcsAsOf: string;
  evidenceReadiness: "FOUR_FACTOR_READY";
  lifecycle: string | null;
  lifecycleReady: boolean;
  checkpoints: number;
  momentumState: string;
  momentumScore: number | null;
  momentumAsOf: string;
  universeRelativeStrength: number | null;
  sectorRelativeStrength: number | null;
  sourceCohort: "controlled_50" | "momentum_expansion" | "final_build";
};

const radarBySymbol = new Map(expandedRadarData.companies.map((company) => [company.symbol, company]));

const controlledRecords: FundamentalChangeRecord[] = signalTrackerV2Comparison.companies.map((company) => {
  const radar = radarBySymbol.get(company.symbol);
  return {
    symbol: company.symbol,
    companyName: company.name,
    sector: radar?.market_cap_segment.industry || company.sectorBenchmarkLabel,
    capSegment: radar?.market_cap_segment.label || "Unclassified",
    fcsScore: company.display_score_v2,
    fcsPeriod: "Latest comparable reporting period",
    fcsAsOf: signalTrackerV2Comparison.informationCutoff,
    evidenceReadiness: "FOUR_FACTOR_READY",
    lifecycle: company.lifecycle_publishable ? company.lifecycle : null,
    lifecycleReady: company.lifecycle_publishable,
    checkpoints: company.checkpoints,
    momentumState: radar?.radar_state || "UNAVAILABLE",
    momentumScore: radar?.experimental_rank_score ?? null,
    momentumAsOf: radar?.as_of_date || expandedRadarData.generated_at.slice(0, 10),
    universeRelativeStrength: radar?.relative_strength_to_universe ?? null,
    sectorRelativeStrength: radar?.relative_strength_to_sector ?? null,
    sourceCohort: "controlled_50",
  };
});

const expansionRecords: FundamentalChangeRecord[] = momentumExpansionStudies.companies
  .filter((company) => company.workflow_status === "BMS_AND_LIFECYCLE_COMPLETE")
  .map((company) => {
    const radar = radarBySymbol.get(company.symbol);
    const latest = company.checkpoints.at(-1)!;
    return {
      symbol: company.symbol,
      companyName: company.company_name,
      sector: radar?.market_cap_segment.industry || "Unclassified",
      capSegment: radar?.market_cap_segment.label || "Unclassified",
      fcsScore: latest.display_score_v2,
      fcsPeriod: latest.checkpoint,
      fcsAsOf: momentumExpansionStudies.generated_at,
      evidenceReadiness: "FOUR_FACTOR_READY",
      lifecycle: company.lifecycle_v2_1,
      lifecycleReady: true,
      checkpoints: company.checkpoints.length,
      momentumState: radar?.radar_state || "UNAVAILABLE",
      momentumScore: radar?.experimental_rank_score ?? null,
      momentumAsOf: radar?.as_of_date || expandedRadarData.generated_at.slice(0, 10),
      universeRelativeStrength: radar?.relative_strength_to_universe ?? null,
      sectorRelativeStrength: radar?.relative_strength_to_sector ?? null,
      sourceCohort: "momentum_expansion",
    };
  });

const finalBuildRecords: FundamentalChangeRecord[] = finalBuildFcsScores.records.map((company) => {
  const radar = radarBySymbol.get(company.symbol);
  if (!radar) throw new Error(`Final-build FCS company '${company.symbol}' is missing from the Momentum Radar dataset.`);
  return {
    symbol: company.symbol,
    companyName: radar.company_name,
    sector: radar.market_cap_segment.industry || "Unclassified",
    capSegment: radar.market_cap_segment.label || "Unclassified",
    fcsScore: company.display_score_v2,
    fcsPeriod: company.period,
    fcsAsOf: finalBuildFcsScores.information_cutoff,
    evidenceReadiness: "FOUR_FACTOR_READY",
    lifecycle: null,
    lifecycleReady: false,
    checkpoints: company.checkpoints,
    momentumState: radar.radar_state,
    momentumScore: radar.experimental_rank_score ?? null,
    momentumAsOf: radar.as_of_date,
    universeRelativeStrength: radar.relative_strength_to_universe ?? null,
    sectorRelativeStrength: radar.relative_strength_to_sector ?? null,
    sourceCohort: "final_build",
  };
});

export const fundamentalChangeLibrary: FundamentalChangeRecord[] = [
  ...controlledRecords,
  ...expansionRecords,
  ...finalBuildRecords,
];
