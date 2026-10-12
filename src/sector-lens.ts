import { classifySectorTaxonomy } from "./sector-taxonomy";

export type SectorRegime = "STRENGTHENING" | "ESTABLISHED" | "MIXED" | "WEAKENING" | "NEGATIVE";
export type SectorRelationship = "SECTOR_SUPPORTED" | "LEADING_SECTOR" | "LAGGING_SECTOR" | "MIXED";
export type SectorLensLevel = "BROAD" | "SUBSECTOR" | "THEME";

export type SectorLensCompany = {
  symbol: string;
  company_name: string;
  radar_state: string;
  data_status: string;
  momentum_12_1: number;
  momentum_6_1: number;
  momentum_3m: number;
  momentum_1m: number;
  relative_strength: number;
  adjusted_close: number;
  sma_200: number;
  distance_from_sma50: number;
  experimental_rank_score: number | null;
  market_cap_segment: { id: string; label: string; industry: string | null };
  liquidity_gate?: { qualified: boolean };
  current_momentum_trigger?: {
    momentum_20d: number;
    momentum_5d: number;
    traded_value_acceleration_5_vs_prior_20: number;
  } | null;
};

export type SectorSummary = {
  industry: string;
  level: SectorLensLevel;
  broadSectors: string[];
  constituentCount: number;
  regime: SectorRegime;
  median12To1: number;
  median6To1: number;
  median3Month: number;
  median20Day: number;
  marketRelativeStrength: number;
  positiveBreadth: number;
  negativeBreadth: number;
  above50DayBreadth: number;
  above200DayBreadth: number;
  volumeAcceleration: number | null;
};

const positiveStates = new Set(["STARTING", "CONFIRMED", "EXTENDED"]);

const median = (values: number[]) => {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[midpoint] : (ordered[midpoint - 1] + ordered[midpoint]) / 2;
};

const share = <T,>(values: T[], predicate: (value: T) => boolean) => values.length
  ? values.filter(predicate).length / values.length
  : 0;

export function eligibleSectorCompanies<T extends SectorLensCompany>(companies: T[]) {
  return companies.filter((company) => company.data_status === "full_history"
    && company.liquidity_gate?.qualified === true
    && Boolean(company.market_cap_segment?.industry));
}

export function classifySector(summary: Omit<SectorSummary, "regime">): SectorRegime {
  const mediumTermPositive = summary.median12To1 > 0 && summary.median6To1 > 0 && summary.median3Month > 0;
  const recentPositive = summary.median20Day > 0;
  const participationPositive = summary.positiveBreadth >= 0.5 && summary.above50DayBreadth >= 0.55;
  const relativePositive = summary.marketRelativeStrength > 0;

  if (mediumTermPositive && recentPositive && participationPositive && relativePositive) return "STRENGTHENING";
  if (mediumTermPositive && summary.positiveBreadth >= 0.35 && summary.above200DayBreadth >= 0.5 && relativePositive && summary.median20Day > -0.05) return "ESTABLISHED";
  if (summary.negativeBreadth >= 0.55 && summary.median3Month < 0 && summary.above50DayBreadth < 0.35) return "NEGATIVE";
  if ((summary.median12To1 > 0 || summary.median6To1 > 0)
    && (summary.median3Month <= 0 || summary.median20Day < 0)
    && (summary.positiveBreadth >= 0.25 || summary.above200DayBreadth >= 0.5)) return "WEAKENING";
  return "MIXED";
}

export function companiesInSectorGroup<T extends SectorLensCompany>(companies: T[], level: SectorLensLevel, groupName: string) {
  return eligibleSectorCompanies(companies).filter((company) => {
    const taxonomy = classifySectorTaxonomy(company);
    if (level === "BROAD") return taxonomy.broadSector === groupName;
    if (level === "SUBSECTOR") return taxonomy.subsector === groupName;
    return taxonomy.themes.includes(groupName);
  });
}

export function buildSectorSummaries<T extends SectorLensCompany>(companies: T[], minimumConstituents = 10, level: SectorLensLevel = "BROAD") {
  const grouped = new Map<string, T[]>();
  eligibleSectorCompanies(companies).forEach((company) => {
    const taxonomy = classifySectorTaxonomy(company);
    const groups = level === "BROAD" ? [taxonomy.broadSector] : level === "SUBSECTOR" ? [taxonomy.subsector] : taxonomy.themes;
    groups.forEach((industry) => grouped.set(industry, [...(grouped.get(industry) ?? []), company]));
  });

  const summaries: SectorSummary[] = [];
  grouped.forEach((constituents, industry) => {
    if (constituents.length < minimumConstituents) return;
    const currentTriggers = constituents
      .map((company) => company.current_momentum_trigger)
      .filter((trigger): trigger is NonNullable<T["current_momentum_trigger"]> => Boolean(trigger));
    const withoutRegime = {
      industry,
      level,
      broadSectors: Array.from(new Set(constituents.map((company) => classifySectorTaxonomy(company).broadSector))).sort(),
      constituentCount: constituents.length,
      median12To1: median(constituents.map((company) => company.momentum_12_1)),
      median6To1: median(constituents.map((company) => company.momentum_6_1)),
      median3Month: median(constituents.map((company) => company.momentum_3m)),
      median20Day: currentTriggers.length
        ? median(currentTriggers.map((trigger) => trigger.momentum_20d))
        : median(constituents.map((company) => company.momentum_1m)),
      marketRelativeStrength: median(constituents.map((company) => company.relative_strength)),
      positiveBreadth: share(constituents, (company) => positiveStates.has(company.radar_state)),
      negativeBreadth: share(constituents, (company) => company.radar_state === "DETERIORATING"),
      above50DayBreadth: share(constituents, (company) => company.distance_from_sma50 > 0),
      above200DayBreadth: share(constituents, (company) => company.adjusted_close > company.sma_200),
      volumeAcceleration: currentTriggers.length
        ? median(currentTriggers.map((trigger) => trigger.traded_value_acceleration_5_vs_prior_20))
        : null,
    };
    summaries.push({ ...withoutRegime, regime: classifySector(withoutRegime) });
  });

  const order: Record<SectorRegime, number> = { STRENGTHENING: 0, ESTABLISHED: 1, MIXED: 2, WEAKENING: 3, NEGATIVE: 4 };
  return summaries.sort((left, right) => order[left.regime] - order[right.regime]
    || right.positiveBreadth - left.positiveBreadth
    || left.industry.localeCompare(right.industry));
}

export function sectorRelationship(company: SectorLensCompany, regime: SectorRegime): SectorRelationship {
  const companyPositive = positiveStates.has(company.radar_state);
  const companyNegative = company.radar_state === "DETERIORATING";
  const sectorPositive = regime === "STRENGTHENING" || regime === "ESTABLISHED";
  const sectorNegative = regime === "NEGATIVE";
  if ((companyPositive && sectorPositive) || (companyNegative && sectorNegative)) return "SECTOR_SUPPORTED";
  if (companyPositive && !sectorPositive) return "LEADING_SECTOR";
  if (!companyPositive && sectorPositive) return "LAGGING_SECTOR";
  return "MIXED";
}
