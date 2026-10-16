import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BarChart3, BookOpen, Layers3, Search, ShieldAlert, Tags } from "lucide-react";
import expandedRadarData from "../data/bmsMomentumRadarExpanded.json";
import { fundamentalChangeLibrary } from "../data/fundamentalChangeLibrary";
import { buildSectorSummaries, companiesInSectorGroup, eligibleSectorCompanies, sectorRelationship, type SectorLensCompany, type SectorLensLevel, type SectorRegime, type SectorRelationship } from "../sector-lens";
import { classifySectorTaxonomy, sectorTaxonomyMetadata } from "../sector-taxonomy";
import DiscoverTabs from "./DiscoverTabs";
import PlainLanguageTooltip from "./PlainLanguageTooltip";

type RadarDataset = typeof expandedRadarData;
type Company = RadarDataset["companies"][number] & SectorLensCompany;
type Segment = "ALL" | "LARGE_CAP" | "MID_CAP" | "SMALL_CAP" | "MICRO_CAP" | "EXTENDED_NSE" | "UNCLASSIFIED";
type RelationshipFilter = "ALL" | SectorRelationship;

const regimeLabel: Record<SectorRegime, string> = {
  STRENGTHENING: "Strengthening",
  ESTABLISHED: "Established",
  MIXED: "Mixed",
  WEAKENING: "Weakening",
  NEGATIVE: "Negative",
};
const regimeStyle: Record<SectorRegime, string> = {
  STRENGTHENING: "border-emerald-300/30 bg-emerald-300/[0.10] text-emerald-200",
  ESTABLISHED: "border-cyan-300/30 bg-cyan-300/[0.10] text-cyan-200",
  MIXED: "border-zinc-400/25 bg-zinc-400/[0.08] text-zinc-300",
  WEAKENING: "border-amber-300/30 bg-amber-300/[0.10] text-amber-200",
  NEGATIVE: "border-rose-300/30 bg-rose-300/[0.10] text-rose-200",
};
const relationshipLabel: Record<SectorRelationship, string> = {
  SECTOR_SUPPORTED: "Sector-supported",
  LEADING_SECTOR: "Leading sector",
  LAGGING_SECTOR: "Lagging sector",
  MIXED: "Mixed relationship",
};
const stateLabel: Record<string, string> = {
  STARTING: "Early Uptrend", CONFIRMED: "Established Uptrend", EXTENDED: "Stretched Uptrend",
  DETERIORATING: "Negative Direction", DORMANT: "No Directional Setup", INSUFFICIENT_HISTORY: "Insufficient History",
};
const segments: Segment[] = ["ALL", "LARGE_CAP", "MID_CAP", "SMALL_CAP", "MICRO_CAP", "EXTENDED_NSE", "UNCLASSIFIED"];
const pct = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
const share = (value: number) => `${(value * 100).toFixed(0)}%`;
const segmentLabel = (value: string) => value.replaceAll("EXTENDED_NSE", "Broader NSE").replaceAll("_", " ");

export default function SectorLens({ onOpenCompanies, onShowValidation, onBrowseLibrary }: {
  onOpenCompanies: (industry?: string, symbol?: string) => void;
  onShowValidation: () => void;
  onBrowseLibrary: (symbol?: string) => void;
}) {
  const [runtimeRadarData, setRuntimeRadarData] = useState<RadarDataset | null>(null);
  const [refreshWarning, setRefreshWarning] = useState("");
  const [regime, setRegime] = useState<"ALL" | SectorRegime>("ALL");
  const [sectorQuery, setSectorQuery] = useState("");
  const [level, setLevel] = useState<Extract<SectorLensLevel, "BROAD" | "THEME">>("BROAD");
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [selectedSubsector, setSelectedSubsector] = useState<string | null>(null);
  const [segment, setSegment] = useState<Segment>("ALL");
  const [relationship, setRelationship] = useState<RelationshipFilter>("ALL");
  const [companyQuery, setCompanyQuery] = useState("");
  const [scrollRequest, setScrollRequest] = useState<{ targetId: string; nonce: number } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/bms/momentum-radar", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (active && Array.isArray(payload?.companies) && payload.companies.length) setRuntimeRadarData(payload as RadarDataset);
      })
      .catch(() => {
        if (active) setRefreshWarning("The live daily snapshot is unavailable; showing the last bundled verified snapshot.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!scrollRequest) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(scrollRequest.targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollRequest]);

  const radar = runtimeRadarData ?? expandedRadarData;
  const classifiedCompanies = useMemo(() => eligibleSectorCompanies(radar.companies as Company[]), [radar]);
  const minimumConstituents = level === "BROAD" ? 10 : 3;
  const summaries = useMemo(() => buildSectorSummaries(classifiedCompanies, minimumConstituents, level), [classifiedCompanies, level, minimumConstituents]);
  const visibleSummaries = useMemo(() => {
    const query = sectorQuery.trim().toLowerCase();
    return summaries.filter((summary) => (regime === "ALL" || summary.regime === regime)
      && (!query || summary.industry.toLowerCase().includes(query)));
  }, [regime, sectorQuery, summaries]);
  const selectedSummary = summaries.find((summary) => summary.industry === selectedIndustry) ?? visibleSummaries[0] ?? null;
  const subsectorSummaries = useMemo(() => {
    if (level !== "BROAD" || !selectedSummary) return [];
    const broadMembers = companiesInSectorGroup(classifiedCompanies, "BROAD", selectedSummary.industry);
    return buildSectorSummaries(broadMembers, 3, "SUBSECTOR");
  }, [classifiedCompanies, level, selectedSummary]);
  const selectedSubsectorSummary = subsectorSummaries.find((summary) => summary.industry === selectedSubsector) ?? null;
  const activeCompanySummary = selectedSubsectorSummary ?? selectedSummary;
  const activeCompanyLevel: SectorLensLevel = selectedSubsectorSummary ? "SUBSECTOR" : level;
  const fcsSymbols = useMemo(() => new Set(fundamentalChangeLibrary.map((record) => record.symbol)), []);
  const selectedCompanies = useMemo(() => {
    if (!activeCompanySummary) return [];
    const query = companyQuery.trim().toLowerCase();
    return classifiedCompanies
      .filter((company) => companiesInSectorGroup(classifiedCompanies, activeCompanyLevel, activeCompanySummary.industry).some((member) => member.symbol === company.symbol))
      .filter((company) => segment === "ALL" || company.market_cap_segment.id === segment)
      .filter((company) => relationship === "ALL" || sectorRelationship(company, activeCompanySummary.regime) === relationship)
      .filter((company) => !query || company.symbol.toLowerCase().includes(query) || company.company_name.toLowerCase().includes(query))
      .sort((left, right) => (right.experimental_rank_score ?? -1) - (left.experimental_rank_score ?? -1));
  }, [activeCompanyLevel, activeCompanySummary, classifiedCompanies, companyQuery, relationship, segment]);

  const changeLevel = (next: Extract<SectorLensLevel, "BROAD" | "THEME">) => {
    setLevel(next);
    setSelectedIndustry(null);
    setSelectedSubsector(null);
    setSectorQuery("");
    setRegime("ALL");
  };

  const selectSector = (industry: string) => {
    setSelectedIndustry(industry);
    setSelectedSubsector(null);
    setSegment("ALL");
    setRelationship("ALL");
    setCompanyQuery("");
    setScrollRequest({ targetId: level === "BROAD" ? "sector-drilldown" : "sector-company-shortlist", nonce: Date.now() });
  };

  return <main className="min-h-screen bg-app-bg px-4 pb-16 pt-24 text-zinc-100 md:px-6">
    <div className="mx-auto max-w-7xl">
      <DiscoverTabs active="sectors" onCompanies={() => onOpenCompanies()} onSectors={() => undefined} />
      <section className="overflow-hidden rounded-[28px] border border-cyan-400/20 bg-gradient-to-br from-[#0d1728] via-[#101a2b] to-[#0b1321] shadow-2xl">
        <header className="border-b border-white/10 px-5 py-6 md:px-8 md:py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div><div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300"><Layers3 className="h-4 w-4" /> Sector participation across the liquid universe</div><h1 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">Sector Lens</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400 md:text-base">Move from official broad industries into operating subsectors or cross-sector themes, then inspect the companies behind each measured reading.</p><p className="mt-2 text-[11px] font-semibold text-zinc-300">Market data through {radar.market_data.as_of_date} · {classifiedCompanies.length.toLocaleString("en-IN")} liquid companies · {sectorTaxonomyMetadata.name} dated {sectorTaxonomyMetadata.versionDate}</p>{refreshWarning && <p className="mt-2 max-w-3xl rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-[10px] text-amber-100">{refreshWarning}</p>}</div>
            <div className="flex max-w-sm flex-col gap-2"><button type="button" onClick={() => onBrowseLibrary()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-300/[0.10] px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-100 hover:bg-emerald-300/[0.16]"><BookOpen className="h-4 w-4" /> Fundamental Change Library</button><button type="button" onClick={onShowValidation} className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-300/25 bg-violet-300/[0.08] px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-violet-100 hover:bg-violet-300/[0.13]"><BarChart3 className="h-4 w-4" /> Validation record</button></div>
          </div>
          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-xs leading-relaxed text-zinc-300"><strong className="text-amber-100">Measured participation—not a cycle forecast.</strong> Broad sectors use official industry labels. Subsector and theme labels are transparent AlphaSynth classifications; themes may overlap. None predicts returns or alters any company Radar Score, FCS or lifecycle.</div>
        </header>

        <div className="border-b border-white/10 px-5 py-5 md:px-8">
          <div className="mb-4 grid gap-2 sm:grid-cols-2">{([{"id":"BROAD","label":"Sectors & subsectors","copy":"Choose an official sector, then drill into its operating subsectors"},{"id":"THEME","label":"Cross-sector themes","copy":"Overlapping exposures that can span several sectors"}] as const).map((item) => <button key={item.id} type="button" onClick={() => changeLevel(item.id)} className={`rounded-xl border px-4 py-3 text-left transition ${level === item.id ? "border-cyan-300/45 bg-cyan-300/[0.12]" : "border-white/10 bg-black/10 hover:bg-white/[0.035]"}`}><div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] ${level === item.id ? "text-cyan-100" : "text-zinc-300"}`}><Tags className="h-3.5 w-3.5" /> {item.label}</div><div className="mt-1 text-[10px] text-zinc-500">{item.copy}</div></button>)}</div>
          {level === "THEME" && <p className="mb-4 rounded-xl border border-violet-300/20 bg-violet-300/[0.06] px-4 py-3 text-[11px] leading-relaxed text-violet-100"><strong>Companies may appear in more than one theme.</strong> A theme is an additional exposure lens, while each company retains one official broad sector and one primary operating subsector.</p>}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex gap-2 overflow-x-auto pb-1">{(["ALL", "STRENGTHENING", "ESTABLISHED", "MIXED", "WEAKENING", "NEGATIVE"] as const).map((item) => <button key={item} type="button" onClick={() => setRegime(item)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] ${regime === item ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-zinc-500 hover:text-white"}`}>{item === "ALL" ? "All sectors" : regimeLabel[item]} {item === "ALL" ? summaries.length : summaries.filter((summary) => summary.regime === item).length}</button>)}</div>
            <label className="relative block lg:ml-auto lg:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" /><input value={sectorQuery} onChange={(event) => setSectorQuery(event.target.value)} placeholder={`Search ${level === "BROAD" ? "sectors" : "themes"}`} className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-300/40" /></label>
          </div>
        </div>

        <div className="p-5 md:p-8">
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[930px] text-left"><thead className="bg-[#182235] text-[10px] uppercase tracking-[0.1em] text-zinc-300"><tr><th className="px-4 py-3.5">{level === "BROAD" ? "Sector" : "Theme"}</th><th className="px-4 py-3.5"><PlainLanguageTooltip label="Measured regime" explanation="A plain-language summary of whether the group is strengthening, established, mixed, weakening or negative based on its current readings. It is not a cycle forecast." /></th><th className="px-4 py-3.5"><PlainLanguageTooltip label="Participation" explanation="The share of companies in the group with positive signals and the share trading above their 50-day average. Broader participation means more companies are moving together." /></th><th className="px-4 py-3.5"><PlainLanguageTooltip label="Medium-term" explanation="The median company return from 12 months to 1 month ago and from 6 months to 1 month ago. The most recent month is excluded." /></th><th className="px-4 py-3.5"><PlainLanguageTooltip label="Recent 20-day" explanation="The median price change of companies in this group over the latest 20 completed trading sessions." /></th><th className="px-4 py-3.5"><PlainLanguageTooltip label="Vs market" explanation="The group's median performance compared with the broad market. Positive means the group has done better over the measured period." /></th></tr></thead>
              <tbody className="divide-y divide-white/[0.07]">{visibleSummaries.map((summary) => <tr key={summary.industry} className={`cursor-pointer transition hover:bg-white/[0.035] ${selectedSummary?.industry === summary.industry ? "bg-cyan-300/[0.045]" : ""}`} onClick={() => selectSector(summary.industry)}><td className="px-4 py-4"><div className="font-semibold text-white">{summary.industry}</div><div className="mt-1 text-[10px] text-zinc-500">{summary.constituentCount} liquid companies · {summary.constituentCount >= 10 ? "broader sample" : "small sample"}</div>{level !== "BROAD" && <div className="mt-1 text-[9px] text-zinc-600">{summary.broadSectors.join(" · ")}</div>}</td><td className="px-4 py-4"><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${regimeStyle[summary.regime]}`}>{regimeLabel[summary.regime]}</span></td><td className="px-4 py-4"><div className="text-sm font-mono text-white">{share(summary.positiveBreadth)} positive</div><div className="mt-1 text-[10px] text-zinc-500">{share(summary.above50DayBreadth)} above 50-day average</div></td><td className="px-4 py-4 text-xs"><div className="flex justify-between gap-4"><span className="text-zinc-500">12–1</span><span className="font-mono text-white">{pct(summary.median12To1)}</span></div><div className="mt-1 flex justify-between gap-4"><span className="text-zinc-500">6–1</span><span className="font-mono text-white">{pct(summary.median6To1)}</span></div></td><td className={`px-4 py-4 font-mono text-sm ${summary.median20Day >= 0 ? "text-emerald-200" : "text-rose-200"}`}>{pct(summary.median20Day)}</td><td className={`px-4 py-4 font-mono text-sm ${summary.marketRelativeStrength >= 0 ? "text-cyan-200" : "text-amber-200"}`}>{pct(summary.marketRelativeStrength)}</td></tr>)}</tbody>
            </table>
          </div>

          {level === "BROAD" && selectedSummary && <section id="sector-drilldown" className="scroll-mt-24 mt-6 rounded-3xl border border-violet-300/20 bg-violet-300/[0.035] p-5 md:p-6">
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-300">Operating subsectors within the selected sector</div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-semibold text-white">{selectedSummary.industry}</h2><p className="mt-1 text-xs text-zinc-400">Choose a subsector to narrow the company list. Groups with three to nine companies are marked as small samples.</p></div>{selectedSubsector && <button type="button" onClick={() => setSelectedSubsector(null)} className="text-[10px] font-bold uppercase tracking-wide text-violet-200 hover:text-white">Show the whole sector</button>}</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{subsectorSummaries.map((summary) => <button key={summary.industry} type="button" onClick={() => { setSelectedSubsector(summary.industry); setSegment("ALL"); setRelationship("ALL"); setCompanyQuery(""); setScrollRequest({ targetId: "sector-company-shortlist", nonce: Date.now() }); }} className={`rounded-2xl border p-4 text-left transition ${selectedSubsector === summary.industry ? "border-violet-300/50 bg-violet-300/[0.12]" : "border-white/10 bg-black/15 hover:bg-white/[0.04]"}`}><div className="flex items-start justify-between gap-3"><div className="font-semibold text-white">{summary.industry}</div><span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${regimeStyle[summary.regime]}`}>{regimeLabel[summary.regime]}</span></div><div className="mt-2 text-[10px] text-zinc-400">{summary.constituentCount} companies · {summary.constituentCount >= 10 ? "broader sample" : "small sample"}</div><div className="mt-2 flex gap-4 text-[10px]"><span className="text-zinc-500">Positive <strong className="text-zinc-200">{share(summary.positiveBreadth)}</strong></span><span className="text-zinc-500">20-day <strong className={summary.median20Day >= 0 ? "text-emerald-200" : "text-rose-200"}>{pct(summary.median20Day)}</strong></span></div></button>)}</div>
            {!subsectorSummaries.length && <p className="mt-4 rounded-xl border border-white/10 bg-black/15 p-4 text-xs text-zinc-400">No operating subsector has at least three dependable liquid constituents. The broad-sector company list remains available below.</p>}
          </section>}

          {activeCompanySummary && <section id="sector-company-shortlist" className="scroll-mt-24 mt-6 rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.035] p-5 md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Companies behind this reading</div><h2 className="mt-2 text-2xl font-semibold text-white">{activeCompanySummary.industry}</h2>{selectedSubsectorSummary && <p className="mt-1 text-[10px] font-semibold text-violet-200">Subsector of {selectedSummary?.industry}</p>}<p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-400">Sector-supported companies move with the measured group direction. Themes can span several official sectors and are an additional research filter, not a replacement classification.</p></div><button type="button" onClick={() => onOpenCompanies(level === "BROAD" ? selectedSummary?.industry : undefined)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-300/[0.12] px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-100 hover:bg-cyan-300/[0.18]">{level === "BROAD" ? "View sector in Company Momentum" : "Open Company Momentum"} <ArrowRight className="h-4 w-4" /></button></div>
            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center"><div className="flex gap-2 overflow-x-auto pb-1">{segments.map((item) => <button key={item} type="button" onClick={() => setSegment(item)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] ${segment === item ? "border-violet-300/50 bg-violet-300/15 text-violet-100" : "border-white/10 text-zinc-500 hover:text-white"}`}>{item === "ALL" ? "All sizes" : segmentLabel(item)}</button>)}</div><select aria-label="Company-sector relationship" value={relationship} onChange={(event) => setRelationship(event.target.value as RelationshipFilter)} className="rounded-xl border border-white/10 bg-[#111b2d] px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-cyan-300/40"><option value="ALL">All relationships</option><option value="SECTOR_SUPPORTED">Sector-supported</option><option value="LEADING_SECTOR">Leading the sector</option><option value="LAGGING_SECTOR">Lagging the sector</option><option value="MIXED">Mixed relationship</option></select><label className="relative block lg:ml-auto lg:w-64"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" /><input value={companyQuery} onChange={(event) => setCompanyQuery(event.target.value)} placeholder="Search companies" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-300/40" /></label></div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[980px] text-left"><thead className="bg-black/20 text-[9px] uppercase tracking-[0.1em] text-zinc-400"><tr><th className="px-4 py-3">Company</th><th className="px-4 py-3">Subsector & themes</th><th className="px-4 py-3">Company momentum</th><th className="px-4 py-3">Group relationship</th><th className="px-4 py-3">Radar score</th><th className="px-4 py-3">Research actions</th></tr></thead><tbody className="divide-y divide-white/[0.07]">{selectedCompanies.slice(0, 50).map((company) => { const relation = sectorRelationship(company, activeCompanySummary.regime); const taxonomy = classifySectorTaxonomy(company); const fcsAvailable = fcsSymbols.has(company.symbol); return <tr key={company.symbol}><td className="px-4 py-4"><div className="font-mono text-xs font-bold text-white">{company.symbol}</div><div className="mt-1 text-[10px] text-zinc-400">{company.company_name} · {segmentLabel(company.market_cap_segment.label)}</div></td><td className="max-w-[220px] px-4 py-4"><div className="text-xs text-zinc-200">{taxonomy.subsector}</div>{taxonomy.themes.length > 0 && <div className="mt-1 text-[9px] text-cyan-200">{taxonomy.themes.join(" · ")}</div>}<div className="mt-1 text-[8px] uppercase tracking-wide text-zinc-600">{taxonomy.confidence === "HIGH" ? "Curated v1" : "Broad-label fallback"}</div></td><td className="px-4 py-4 text-xs text-zinc-200">{stateLabel[company.radar_state] ?? company.radar_state}</td><td className="px-4 py-4"><span className="rounded-full border border-white/10 bg-white/[0.035] px-2 py-1 text-[9px] font-bold text-zinc-200">{relationshipLabel[relation]}</span></td><td className="px-4 py-4 font-mono text-sm text-white">{company.experimental_rank_score ?? "—"}</td><td className="px-4 py-4"><div className="flex min-w-[150px] flex-col items-start gap-2"><button type="button" onClick={() => onOpenCompanies(undefined, company.symbol)} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/30 bg-cyan-300/[0.09] px-2.5 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-100 hover:bg-cyan-300/[0.16]">View momentum <ArrowRight className="h-3 w-3" /></button>{fcsAvailable ? <button type="button" onClick={() => onBrowseLibrary(company.symbol)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-300/[0.09] px-2.5 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-100 hover:bg-emerald-300/[0.16]"><BookOpen className="h-3 w-3" /> View FCS</button> : <span className="text-[9px] text-zinc-500">FCS not yet reviewed</span>}</div></td></tr>; })}</tbody></table></div>
            {!selectedCompanies.length && <div className="py-12 text-center text-sm text-zinc-400">No companies match this combination of filters.</div>}
          </section>}
          <div className="mt-6 grid gap-3 text-xs leading-relaxed text-zinc-400 md:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><strong className="text-white">How it is calculated</strong><p className="mt-1">Every displayed group uses median constituent momentum, breadth, participation above the 50-day and 200-day averages, and median relative strength. Broad sectors require 10 companies; displayed subsectors and themes require three, with samples below ten visibly marked.</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><ShieldAlert className="mb-2 h-4 w-4 text-amber-200" /><strong className="text-white">Classification boundary</strong><p className="mt-1">Official broad industries remain intact. Each company has one primary AlphaSynth subsector and may carry several cross-sector themes. These labels are not recommendations, FCS inputs, or claims about future returns.</p></div></div>
        </div>
      </section>
    </div>
  </main>;
}
