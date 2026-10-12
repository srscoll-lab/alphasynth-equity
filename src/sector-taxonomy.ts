export type TaxonomyConfidence = "HIGH" | "MEDIUM" | "BROAD_ONLY";

export type SectorTaxonomy = {
  broadSector: string;
  subsector: string;
  themes: string[];
  confidence: TaxonomyConfidence;
  methodology: "CURATED_SYMBOL_MAP_V1" | "DETERMINISTIC_INDUSTRY_FALLBACK_V1";
};

type TaxonomyCompany = {
  symbol: string;
  company_name: string;
  market_cap_segment: { industry: string | null };
};

const groups = {
  hospitals: ["YATHARTH", "MEDANTA", "HCG", "APOLLOHOSP", "RAINBOW", "AGARWALEYE", "KIMS", "NH", "ASTERDM", "FORTIS", "MAXHEALTH"],
  diagnostics: ["VIJAYA", "LALPATHLAB", "THYROCARE", "METROPOLIS"],
  medicalDevices: ["POLYMED"],
  lifeScienceServices: ["SAILIFE", "ANTHEM", "SYNGENE", "INDGN"],
  apiCdmo: ["LAURUSLABS", "DIVISLAB", "AKUMS", "NEULANDLAB", "AARTIPHARM", "CONCORDBIO", "SUPRIYA", "BLUEJET", "ACUTAAS", "VIYASH", "COHANCE", "ONESOURCE"],
  defence: ["PARAS", "AZAD", "PTCIL", "MTARTECH", "DYNAMATECH", "APOLLO", "ASTRAMICRO", "DATAPATTNS", "HAL", "BEML", "ZENTEC", "AXISCADES", "GRSE", "COCHINSHIP", "MAZDOCK", "BEL", "BDL"],
  railways: ["BEML", "TEXRAIL", "TITAGARH", "JWL", "RITES", "IRCON", "RVNL", "RAILTEL"],
  powerEquipment: ["DIACABS", "TDPOWERSYS", "QPOWER", "FINCABLES", "APARINDS", "RRKABEL", "BHEL", "SIEMENS", "VOLTAMP", "ABB", "POWERINDIA", "CGPOWER", "SCHNEIDER", "KEI", "POLYCAB", "GVT&D", "ENRIN", "HBLENGINE", "TRANSRAILL", "TARIL", "KPIL", "TECHNOE", "KEC"],
  renewableEquipment: ["BORORENEW", "PREMIERENE", "SUZLON", "WAAREERTL", "WEBELSOLAR", "WAAREEENER", "VIKRAMSOLR", "INOXWIND", "SWSOLAR"],
  renewablePower: ["ACMESOLAR", "ADANIGREEN", "NTPCGREEN", "KPIGREEN"],
  roads: ["IRB", "KNRCON", "PNCINFRA", "ASHOKA"],
  evOems: ["ATHERENERG", "OLAELEC", "OLECTRA"],
  evComponents: ["SONACOMS", "EXIDEIND", "ARE&M"],
  vehicleOems: ["TVSMOTOR", "BAJAJ-AUTO", "EICHERMOT", "HEROMOTOCO", "HYUNDAI", "M&M", "MARUTI", "FORCEMOT", "TMPV", "ASHOKLEY", "ESCORTS"],
  tyres: ["BALKRISIND", "CEATLTD", "MRF", "APOLLOTYRE", "JKTYRE"],
  dataCentres: ["NETWEB", "BBOX", "TATACOMM", "STLTECH", "TECHNOE", "AURIONPRO"],
  telecomOperators: ["IDEA", "BHARTIARTL", "BHARTIHEXA"],
  telecomEquipment: ["STLTECH", "HFCL", "OPTIEMUS", "TEJASNET"],
  engineeringResearch: ["TATATECH", "CYIENT", "LTTS", "TATAELXSI", "KPITTECH"],
  electronicsManufacturing: ["SYRMA", "AVALON", "KAYNES", "OPTIEMUS"],
} as const;

const member = (symbol: string, list: readonly string[]) => list.includes(symbol);

function curatedSubsector(symbol: string, broadSector: string): string | null {
  if (member(symbol, groups.hospitals)) return "Hospitals & Clinical Care";
  if (member(symbol, groups.diagnostics)) return "Diagnostics";
  if (member(symbol, groups.medicalDevices)) return "Medical Devices";
  if (member(symbol, groups.lifeScienceServices)) return "Life-science Research & Services";
  if (member(symbol, groups.apiCdmo)) return "APIs, CDMO & Contract Manufacturing";
  if (member(symbol, groups.defence)) return "Defence & Aerospace Equipment";
  if (member(symbol, groups.railways)) return "Railway Equipment & Projects";
  if (member(symbol, groups.renewableEquipment)) return "Renewable-energy Equipment";
  if (member(symbol, groups.powerEquipment)) return "Power Equipment, T&D & Electrification";
  if (member(symbol, groups.renewablePower)) return "Renewable Power Generation";
  if (["ADANIENSOL", "POWERGRID"].includes(symbol)) return "Power Transmission & Grid";
  if (member(symbol, groups.roads)) return "Roads & Highway Infrastructure";
  if (["RITES", "IRCON", "RVNL"].includes(symbol)) return "Railway EPC & Infrastructure";
  if (member(symbol, groups.evOems)) return "Electric-vehicle Manufacturers";
  if (member(symbol, groups.evComponents)) return "EV Components & Energy Storage";
  if (member(symbol, groups.vehicleOems)) return "Vehicle Manufacturers";
  if (member(symbol, groups.tyres)) return "Tyres";
  if (broadSector === "Automobile and Auto Components") return "Automotive Components";
  if (member(symbol, groups.dataCentres)) return "Digital & Data-centre Infrastructure";
  if (member(symbol, groups.telecomOperators)) return "Telecom Operators";
  if (member(symbol, groups.telecomEquipment)) return "Telecom Equipment & Networks";
  if (symbol === "INDUSTOWER") return "Telecom Towers";
  if (member(symbol, groups.engineeringResearch)) return "Engineering R&D Software";
  if (member(symbol, groups.electronicsManufacturing)) return "Electronics Manufacturing";
  return null;
}

function fallbackSubsector(broadSector: string): string {
  const fallback: Record<string, string> = {
    Healthcare: "Pharmaceuticals & Life Sciences",
    "Capital Goods": "Industrial Equipment & Components",
    Power: "Power Generation & Utilities",
    Construction: "EPC & General Infrastructure",
    "Automobile and Auto Components": "Automotive Components",
    "Information Technology": "Digital & IT Services",
    Telecommunication: "Telecom Services & Infrastructure",
    Services: "Business, Transport & Other Services",
  };
  return fallback[broadSector] ?? broadSector;
}

function themeTags(symbol: string): string[] {
  const themes: string[] = [];
  if (member(symbol, groups.defence)) themes.push("Defence & Aerospace");
  if (member(symbol, groups.renewableEquipment) || member(symbol, groups.renewablePower) || ["INOXGREEN"].includes(symbol)) themes.push("Renewable Energy");
  if (member(symbol, groups.evOems) || member(symbol, groups.evComponents) || ["KPITTECH", "TATAELXSI"].includes(symbol)) themes.push("Electric Vehicles & Storage");
  if (member(symbol, groups.dataCentres)) themes.push("Data-centre Infrastructure");
  if (member(symbol, groups.railways)) themes.push("Railways");
  if (member(symbol, groups.electronicsManufacturing)) themes.push("Electronics Manufacturing");
  if (member(symbol, groups.powerEquipment) || ["ADANIENSOL", "POWERGRID"].includes(symbol)) themes.push("Grid Modernisation & Electrification");
  return themes;
}

export function classifySectorTaxonomy(company: TaxonomyCompany): SectorTaxonomy {
  const broadSector = company.market_cap_segment.industry ?? "Unclassified";
  const subsector = curatedSubsector(company.symbol, broadSector);
  const themes = themeTags(company.symbol);
  const curated = Boolean(subsector) || themes.length > 0;
  return {
    broadSector,
    subsector: subsector ?? fallbackSubsector(broadSector),
    themes,
    confidence: curated ? "HIGH" : "BROAD_ONLY",
    methodology: curated ? "CURATED_SYMBOL_MAP_V1" : "DETERMINISTIC_INDUSTRY_FALLBACK_V1",
  };
}

export const sectorTaxonomyMetadata = {
  name: "AlphaSynth sector taxonomy v1",
  versionDate: "2026-10-12",
  description: "Official broad NSE industry labels supplemented by conservative, deterministic subsector and multi-label theme assignments.",
};
