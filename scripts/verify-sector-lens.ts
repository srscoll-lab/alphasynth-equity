import radar from "../src/data/bmsMomentumRadarExpanded.json" with { type: "json" };
import { buildSectorSummaries, companiesInSectorGroup, eligibleSectorCompanies, sectorRelationship, type SectorLensCompany, type SectorLensLevel } from "../src/sector-lens";
import { classifySectorTaxonomy } from "../src/sector-taxonomy";

const companies = radar.companies as unknown as SectorLensCompany[];
const eligible = eligibleSectorCompanies(companies);
const summaries = buildSectorSummaries(companies, 10);
const levels: Array<{ level: SectorLensLevel; minimum: number }> = [
  { level: "BROAD", minimum: 10 },
  { level: "SUBSECTOR", minimum: 5 },
  { level: "THEME", minimum: 3 },
];

if (!eligible.length) throw new Error("Sector Lens has no eligible companies.");
if (!summaries.length) throw new Error("Sector Lens produced no sector summaries.");
if (summaries.some((summary) => summary.constituentCount < 10)) throw new Error("A published sector has fewer than ten constituents.");
if (summaries.some((summary) => [summary.positiveBreadth, summary.negativeBreadth, summary.above50DayBreadth, summary.above200DayBreadth].some((value) => value < 0 || value > 1))) {
  throw new Error("A sector breadth value is outside the 0–1 range.");
}

for (const summary of summaries) {
  const sample = eligible.find((company) => company.market_cap_segment.industry === summary.industry);
  if (!sample) throw new Error(`No company found for ${summary.industry}.`);
  sectorRelationship(sample, summary.regime);
}

const levelSummaries = Object.fromEntries(levels.map(({ level, minimum }) => {
  const grouped = buildSectorSummaries(companies, minimum, level);
  if (!grouped.length) throw new Error(`${level} produced no groups.`);
  if (grouped.some((summary) => summary.constituentCount < minimum)) throw new Error(`${level} published an undersized group.`);
  grouped.forEach((summary) => {
    const members = companiesInSectorGroup(companies, level, summary.industry);
    if (members.length !== summary.constituentCount) throw new Error(`${summary.industry} member count does not reconcile.`);
  });
  return [level, grouped];
}));

const themeNames = new Set(levelSummaries.THEME.map((summary) => summary.industry));
for (const required of ["Defence & Aerospace", "Renewable Energy", "Electric Vehicles & Storage", "Data-centre Infrastructure"]) {
  if (!themeNames.has(required)) throw new Error(`Required theme is missing: ${required}.`);
}
const subsectorNames = new Set(levelSummaries.SUBSECTOR.map((summary) => summary.industry));
for (const required of ["Hospitals & Clinical Care", "Pharmaceuticals & Life Sciences", "Defence & Aerospace Equipment"]) {
  if (!subsectorNames.has(required)) throw new Error(`Required subsector is missing: ${required}.`);
}
const apollo = eligible.find((company) => company.symbol === "APOLLOHOSP");
if (!apollo || classifySectorTaxonomy(apollo).subsector !== "Hospitals & Clinical Care") throw new Error("Apollo Hospitals taxonomy is incorrect.");
const hal = eligible.find((company) => company.symbol === "HAL");
if (!hal || !classifySectorTaxonomy(hal).themes.includes("Defence & Aerospace")) throw new Error("HAL defence theme is missing.");

console.log(JSON.stringify({
  status: "verified",
  eligibleCompanies: eligible.length,
  publishedSectors: summaries.length,
  publishedSubsectors: levelSummaries.SUBSECTOR.length,
  publishedThemes: levelSummaries.THEME.length,
  themes: levelSummaries.THEME.map((summary) => `${summary.industry}: ${summary.constituentCount}`),
  regimes: Object.fromEntries(["STRENGTHENING", "ESTABLISHED", "MIXED", "WEAKENING", "NEGATIVE"].map((regime) => [regime, summaries.filter((summary) => summary.regime === regime).length])),
}, null, 2));
