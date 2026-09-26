import { useMemo, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, ChevronDown, ChevronUp, Clock3, Compass, Search, ShieldAlert, TrendingUp, X } from "lucide-react";
import radarData from "../data/bmsMomentumRadar.json";
import expandedRadarData from "../data/bmsMomentumRadarExpanded.json";
import lifecycleV21 from "../data/momentumExpansionLifecycleV21.json";
import expansionStudies from "../data/momentumExpansionStudies.json";

type RadarState = "DORMANT" | "STARTING" | "CONFIRMED" | "EXTENDED" | "DETERIORATING" | "INSUFFICIENT_HISTORY";
type Segment = "LARGE_CAP" | "MID_CAP" | "SMALL_CAP" | "MICRO_CAP" | "EXTENDED_NSE" | "UNCLASSIFIED";
type RadarDataset = typeof expandedRadarData;
type Company = RadarDataset["companies"][number];

const allStates: Array<"ALL" | RadarState> = ["ALL", "STARTING", "CONFIRMED", "EXTENDED", "DORMANT", "DETERIORATING", "INSUFFICIENT_HISTORY"];
const activeSignalStates: Array<"ALL" | RadarState> = ["ALL", "STARTING", "CONFIRMED", "EXTENDED"];
const segments: Array<"ALL" | Segment> = ["ALL", "LARGE_CAP", "MID_CAP", "SMALL_CAP", "MICRO_CAP", "EXTENDED_NSE", "UNCLASSIFIED"];
const stateStyle: Record<RadarState, string> = {
  DORMANT: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  STARTING: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  CONFIRMED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  EXTENDED: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  DETERIORATING: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  INSUFFICIENT_HISTORY: "border-violet-400/30 bg-violet-400/10 text-violet-300",
};
const stateMeaning: Record<RadarState, string> = {
  DORMANT: "No qualifying trend-and-relative-strength setup is present.",
  STARTING: "Early price and relative-strength conditions are improving, but the full trend is not confirmed.",
  CONFIRMED: "Price, medium-term trend and relative strength satisfy the experimental confirmation rules.",
  EXTENDED: "A confirmed trend is unusually stretched above its 50-session average; chasing risk may be elevated.",
  DETERIORATING: "Trend or relative strength has weakened under the experimental rules.",
  INSUFFICIENT_HISTORY: "Fewer than 252 sessions are available, so no cross-sectional rank is published.",
};
const pct = (value: number | null) => value === null ? "Unavailable" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
const money = (value: number | null) => value === null ? "Unavailable" : `₹${new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
const lifecycleBySymbol = new Map(lifecycleV21.companies.map((company) => [company.symbol, company]));
const studyBySymbol = new Map(expansionStudies.companies.map((company) => [company.symbol, company]));
const lifecycleStyle: Record<string, string> = {
  ESTABLISHED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  FADING: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  RECOVERING: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  REBOUNDING: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300",
  BUILDING: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  EMERGING: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  WATCH: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
};

type MomentumRadarProps = {
  onBack: () => void;
  onBrowseLibrary: () => void;
  onDeepDive: (company: { symbol: string; company_name: string; bms_status: "ready" | "evidence_queued" | "not_queued" }) => void;
};

export default function MomentumRadar({ onBack, onBrowseLibrary, onDeepDive }: MomentumRadarProps) {
  const expandedMode = new URLSearchParams(window.location.search).get("radar") === "expanded";
  const activeRadarData: RadarDataset = expandedMode ? expandedRadarData : radarData as unknown as RadarDataset;
  const scannedCompanies = activeRadarData.companies as Company[];
  const momentumReadyCompanies = expandedMode
    ? scannedCompanies.filter((company) => company.liquidity_gate?.qualified && company.data_status === "full_history")
    : scannedCompanies;
  const companies = expandedMode
    ? momentumReadyCompanies.filter((company) => company.radar_state === "STARTING" || company.radar_state === "CONFIRMED" || company.radar_state === "EXTENDED")
    : scannedCompanies;
  const inactiveMomentumCompanies = expandedMode
    ? momentumReadyCompanies.filter((company) => company.radar_state === "DORMANT" || company.radar_state === "DETERIORATING")
    : [];
  const activeSignalSummary = {
    starting: companies.filter((company) => company.radar_state === "STARTING").length,
    confirmed: companies.filter((company) => company.radar_state === "CONFIRMED").length,
    extended: companies.filter((company) => company.radar_state === "EXTENDED").length,
  };
  const visibleStates = expandedMode ? activeSignalStates : allStates;
  const [filter, setFilter] = useState<"ALL" | RadarState>("ALL");
  const [segment, setSegment] = useState<"ALL" | Segment>("ALL");
  const [query, setQuery] = useState("");
  const [selectedStudySymbol, setSelectedStudySymbol] = useState<string | null>(null);
  const [selectedStatusSymbol, setSelectedStatusSymbol] = useState<string | null>(null);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);
  const [inactiveFilter, setInactiveFilter] = useState<"ALL" | "DORMANT" | "DETERIORATING">("ALL");
  const [inactiveQuery, setInactiveQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return companies.filter((company) => (filter === "ALL" || company.radar_state === filter)
      && (segment === "ALL" || company.market_cap_segment.id === segment)
      && (!normalized || company.symbol.toLowerCase().includes(normalized) || company.company_name.toLowerCase().includes(normalized)));
  }, [companies, filter, query, segment]);
  const displayed = filtered.slice(0, 100);
  const stateCounts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const relevant = companies.filter((company) => (segment === "ALL" || company.market_cap_segment.id === segment)
      && (!normalized || company.symbol.toLowerCase().includes(normalized) || company.company_name.toLowerCase().includes(normalized)));
    return Object.fromEntries(visibleStates.map((state) => [state, state === "ALL" ? relevant.length : relevant.filter((company) => company.radar_state === state).length])) as Partial<Record<"ALL" | RadarState, number>>;
  }, [companies, query, segment, visibleStates]);
  const segmentCounts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const relevant = companies.filter((company) => (filter === "ALL" || company.radar_state === filter)
      && (!normalized || company.symbol.toLowerCase().includes(normalized) || company.company_name.toLowerCase().includes(normalized)));
    return Object.fromEntries(segments.map((item) => [item, item === "ALL" ? relevant.length : relevant.filter((company) => company.market_cap_segment.id === item).length])) as Record<"ALL" | Segment, number>;
  }, [companies, filter, query]);
  const selectedStudy = selectedStudySymbol ? studyBySymbol.get(selectedStudySymbol) : null;
  const selectedStatusCompany = selectedStatusSymbol ? companies.find((company) => company.symbol === selectedStatusSymbol) : null;
  const inactiveCounts = {
    all: inactiveMomentumCompanies.length,
    dormant: inactiveMomentumCompanies.filter((company) => company.radar_state === "DORMANT").length,
    deteriorating: inactiveMomentumCompanies.filter((company) => company.radar_state === "DETERIORATING").length,
  };
  const filteredInactiveCompanies = inactiveMomentumCompanies.filter((company) => {
    const normalized = inactiveQuery.trim().toLowerCase();
    return (inactiveFilter === "ALL" || company.radar_state === inactiveFilter)
      && (!normalized || company.symbol.toLowerCase().includes(normalized) || company.company_name.toLowerCase().includes(normalized));
  });
  const displayedInactiveCompanies = filteredInactiveCompanies.slice(0, 100);
  const latestCheckpoint = selectedStudy?.checkpoints.at(-1);
  const openStudy = (symbol: string) => {
    setSelectedStudySymbol(symbol);
    window.setTimeout(() => document.getElementById("momentum-bms-study")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const toggleInactiveMomentum = () => {
    if (inactiveExpanded) {
      setInactiveExpanded(false);
      return;
    }
    setInactiveExpanded(true);
    window.setTimeout(() => document.getElementById("inactive-momentum-section")?.scrollIntoView({ behavior: "auto", block: "start" }), 50);
  };

  return <main className="min-h-screen bg-app-bg pt-24 pb-16 px-4 md:px-6 text-zinc-100">
    <div className="max-w-7xl mx-auto">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400 hover:text-white mb-7">
        <ArrowLeft className="w-4 h-4" /> Back to Fundamental Change comparison
      </button>
      <section className="rounded-[28px] border border-cyan-400/20 bg-gradient-to-br from-[#0d1728] via-[#101a2b] to-[#0b1321] overflow-hidden shadow-2xl">
        <header className="px-5 py-6 md:px-8 md:py-8 border-b border-white/10">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300 mb-3"><Compass className="w-4 h-4" /> {activeRadarData.universe.scanned.toLocaleString("en-IN")}-company discovery layer</div>
              <h1 className="text-3xl md:text-5xl font-display font-semibold tracking-tight text-white">Momentum Radar</h1>
              <p className="mt-3 text-sm md:text-base text-zinc-400 max-w-3xl leading-relaxed">A deterministic market-guided queue for deciding which companies should receive Fundamental Change evidence work next. It does not alter Fundamental Change Scores or lifecycles.</p>
              <p className="mt-2 text-xs text-cyan-100/70 max-w-3xl leading-relaxed">The first five queued companies show the trajectory-aware Lifecycle V2.1 test result. Official market-cap segments come from source-dated NSE index membership; companies outside those indices remain in a clearly labelled Extended NSE lane. Liquidity never determines company size.</p>
            </div>
            <div className="flex max-w-md flex-col gap-3">
            <button type="button" onClick={onBrowseLibrary} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-300/[0.10] px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100 hover:bg-emerald-300/[0.16]"><BookOpen className="h-4 w-4" /> Browse Fundamental Change Library</button>
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-xs text-amber-100 leading-relaxed">
              <strong className="block mb-1">Experimental—not a return forecast</strong>
              Rankings use provisional adjusted market data and require walk-forward validation before they can become a product gate or investment signal.
            </div>
            </div>
          </div>
          <div className={`grid gap-3 mt-7 ${expandedMode ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
            {[
              ["Universe scanned", `${activeRadarData.universe.scanned}`, expandedMode ? "Official NSE EQ and BE universe" : "Exact monitored FCS universe"],
              ["Analysable liquid universe", `${momentumReadyCompanies.length}`, expandedMode ? "Liquidity-qualified with full price history" : "Complete market history"],
              ["Active momentum signals", `${companies.length}`, expandedMode ? `${activeSignalSummary.starting} Starting · ${activeSignalSummary.confirmed} Confirmed · ${activeSignalSummary.extended} Extended` : "Displayed below"],
            ].map(([label, value, note]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.15em] font-black text-zinc-500">{label}</div><div className="mt-2 text-2xl font-mono font-bold text-white">{value}</div><div className="mt-1 text-xs text-zinc-500">{note}</div>
            </div>)}
            {expandedMode && <button type="button" onClick={toggleInactiveMomentum} className="rounded-2xl border border-slate-400/20 bg-slate-400/[0.055] px-4 py-4 text-left transition hover:border-slate-300/40 hover:bg-slate-400/[0.09]">
              <div className="flex items-center justify-between gap-3"><div className="text-[10px] uppercase tracking-[0.15em] font-black text-slate-400">Presently not enough momentum</div>{inactiveExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}</div>
              <div className="mt-2 text-2xl font-mono font-bold text-slate-200">{inactiveCounts.all}</div>
              <div className="mt-1 text-xs text-slate-500">{inactiveCounts.dormant} Dormant · {inactiveCounts.deteriorating} Deteriorating · view companies</div>
            </button>}
          </div>
        </header>

        <div className="px-5 py-5 md:px-8 border-b border-white/10">
          <div className="flex flex-col gap-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {visibleStates.map((state) => <button key={state} type="button" onClick={() => setFilter(state)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] ${filter === state ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-zinc-500 hover:text-white"}`}>{state === "ALL" && expandedMode ? "ACTIVE SIGNALS" : state.replaceAll("_", " ")} {stateCounts[state] ?? 0}</button>)}
            </div>
            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {segments.map((item) => <button key={item} type="button" onClick={() => setSegment(item)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] ${segment === item ? "border-violet-300/50 bg-violet-300/15 text-violet-100" : "border-white/10 text-zinc-500 hover:text-white"}`}>{item.replaceAll("_", " ")} {segmentCounts[item]}</button>)}
              </div>
              <label className="relative block md:ml-auto md:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search active momentum signals" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-300/40" /></label>
            </div>
            {expandedMode && <p className="text-[10px] leading-relaxed text-zinc-500">The main radar contains only liquid, full-history companies with an active Starting, Confirmed or Extended momentum signal. Companies failing liquidity or history checks, and companies with no active signal, are intentionally omitted from this product view.</p>}
          </div>
        </div>

        <div className="p-5 md:p-8">
          {!!filtered.length && <div className="mb-3 flex flex-col gap-1 text-[10px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
            <span>{filtered.length.toLocaleString("en-IN")} companies match the active filters.</span>
            <span>{filtered.length > displayed.length ? `Showing the first ${displayed.length}; use state, segment, gate or search to narrow the universe.` : `Showing all ${displayed.length}.`}</span>
          </div>}
          <div className="rounded-2xl border border-white/10 overflow-x-auto">
            <table className="w-full min-w-[1840px] text-left">
              <thead className="bg-white/[0.035] text-[9px] uppercase tracking-[0.13em] text-zinc-500"><tr><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Segment</th><th className="px-4 py-3">Selection gate</th><th className="px-4 py-3">Radar state</th><th className="px-4 py-3">Fundamental Change workflow</th><th className="px-4 py-3">Research</th><th className="px-4 py-3">12–1</th><th className="px-4 py-3">6–1</th><th className="px-4 py-3">3 month</th><th className="px-4 py-3">vs Nifty 500</th><th className="px-4 py-3">vs universe</th><th className="px-4 py-3">vs sector</th><th className="px-4 py-3">52w high</th><th className="px-4 py-3">60d median traded value</th></tr></thead>
              <tbody className="divide-y divide-white/[0.07]">{displayed.map((company) => <tr key={company.symbol} className="hover:bg-white/[0.025]">
                <td className="px-4 py-4 font-mono font-bold text-white">{company.experimental_rank_score ?? "—"}</td>
                <td className="px-4 py-4"><div className="font-semibold text-white">{company.symbol}</div><div className="mt-1 text-xs text-zinc-500 max-w-[220px] truncate">{company.company_name}</div></td>
                <td className="px-4 py-4"><span className="rounded-full border border-violet-400/25 bg-violet-400/[0.08] px-2 py-1 text-[9px] font-black text-violet-200">{company.market_cap_segment.label}</span><div className="mt-2 text-[10px] text-zinc-600">{company.market_cap_segment.source_index ?? "Outside official size indices"}</div></td>
                <td className="px-4 py-4">{company.selection_gate.eligible ? <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[9px] font-black text-emerald-300">ELIGIBLE</span> : <><span className="rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-1 text-[9px] font-black text-zinc-400">HELD BACK</span><div className="mt-2 max-w-[180px] text-[10px] leading-relaxed text-zinc-600">{company.selection_gate.exclusion_reasons.join(", ").replaceAll("_", " ")}</div></>}</td>
                <td className="px-4 py-4"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${stateStyle[company.radar_state as RadarState]}`}>{company.radar_state.replaceAll("_", " ")}</span><div className="mt-2 max-w-[230px] text-[10px] leading-relaxed text-zinc-500">{stateMeaning[company.radar_state as RadarState]}</div></td>
                <td className="px-4 py-4">{lifecycleBySymbol.has(company.symbol) ? <><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${lifecycleStyle[lifecycleBySymbol.get(company.symbol)!.lifecycle_v2_1]}`}>FCS &amp; LIFECYCLE READY · {lifecycleBySymbol.get(company.symbol)!.lifecycle_v2_1}</span><div className="mt-2 max-w-[250px] text-[10px] leading-relaxed text-zinc-500">{lifecycleBySymbol.get(company.symbol)!.score_path.join(" → ")} · {lifecycleBySymbol.get(company.symbol)!.reason}</div><button type="button" onClick={() => openStudy(company.symbol)} className="mt-2 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-cyan-300 hover:text-white"><CheckCircle2 className="h-3.5 w-3.5" /> View FCS &amp; lifecycle</button></> : studyBySymbol.has(company.symbol) ? <><span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-200"><Clock3 className="h-3.5 w-3.5" /> Evidence work queued</span><button type="button" onClick={() => setSelectedStatusSymbol(company.symbol)} className="mt-2 block text-[9px] font-black uppercase tracking-[0.1em] text-zinc-400 hover:text-white">View processing status</button></> : <><span className="text-[10px] text-zinc-600">Eligible · not queued</span><div className="mt-2 max-w-[210px] text-[9px] leading-relaxed text-zinc-600">Momentum eligibility does not create a Fundamental Change Score automatically.</div></>}</td>
                <td className="px-4 py-4"><button type="button" onClick={() => onDeepDive({ symbol: company.symbol, company_name: company.company_name, bms_status: lifecycleBySymbol.has(company.symbol) ? "ready" : studyBySymbol.has(company.symbol) ? "evidence_queued" : "not_queued" })} className="inline-flex max-w-[190px] items-center gap-1.5 rounded-lg border border-gold/25 bg-gold/[0.07] px-2.5 py-2 text-left text-[9px] font-black uppercase leading-relaxed tracking-[0.08em] text-gold hover:border-gold/50 hover:text-white"><BookOpen className="h-3.5 w-3.5 shrink-0" />{lifecycleBySymbol.has(company.symbol) ? "Open company deep dive" : studyBySymbol.has(company.symbol) ? "Research while FCS is pending" : "Explore company"}</button></td>
                <td className="px-4 py-4 font-mono text-sm">{pct(company.momentum_12_1)}</td><td className="px-4 py-4 font-mono text-sm">{pct(company.momentum_6_1)}</td><td className="px-4 py-4 font-mono text-sm">{pct(company.momentum_3m)}</td><td className="px-4 py-4 font-mono text-sm">{pct(company.relative_strength)}</td><td className="px-4 py-4"><div className="font-mono text-sm">{pct(company.relative_strength_to_universe)}</div><div className="mt-1 max-w-[150px] text-[9px] leading-relaxed text-zinc-600">{company.universe_benchmark ?? "Unavailable"} · {company.universe_peer_count} peers</div></td><td className="px-4 py-4"><div className="font-mono text-sm">{pct(company.relative_strength_to_sector)}</div><div className="mt-1 max-w-[170px] text-[9px] leading-relaxed text-zinc-600">{company.sector_benchmark ?? "Unavailable"} · {company.sector_peer_count} peers</div></td><td className="px-4 py-4 font-mono text-sm">{pct(company.distance_from_52w_high)}</td><td className="px-4 py-4 font-mono text-sm">{money(company.median_daily_traded_value_60)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {expandedMode && inactiveExpanded && <section id="inactive-momentum-section" className="scroll-mt-24 mt-6 overflow-hidden rounded-3xl border border-slate-400/20 bg-slate-400/[0.035]">
            <header className="border-b border-white/10 p-5 md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div><div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">No current momentum setup</div><h2 className="mt-2 text-2xl font-semibold text-white">Presently not enough momentum</h2><p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-400">These companies passed the liquidity and price-history checks, so their momentum data is available. They are separated from the active discovery list because the current rules classify them as Dormant or Deteriorating.</p></div>
                <button type="button" onClick={() => setInactiveExpanded(false)} className="self-start rounded-xl border border-white/10 p-2 text-zinc-500 hover:text-white" aria-label="Collapse companies without an active momentum setup"><ChevronUp className="h-4 w-4" /></button>
              </div>
              <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {(["ALL", "DORMANT", "DETERIORATING"] as const).map((state) => {
                    const count = state === "ALL" ? inactiveCounts.all : state === "DORMANT" ? inactiveCounts.dormant : inactiveCounts.deteriorating;
                    const label = state === "ALL" ? "NO CURRENT SETUP" : state;
                    return <button key={state} type="button" onClick={() => setInactiveFilter(state)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] ${inactiveFilter === state ? "border-slate-300/50 bg-slate-300/15 text-slate-100" : "border-white/10 text-zinc-500 hover:text-white"}`}>{label} {count}</button>;
                  })}
                </div>
                <label className="relative block md:ml-auto md:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" /><input value={inactiveQuery} onChange={(event) => setInactiveQuery(event.target.value)} placeholder="Search this company list" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-slate-300/40" /></label>
              </div>
            </header>
            <div className="p-5 md:p-6">
              <div className="mb-3 flex flex-col gap-1 text-[10px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between"><span>{filteredInactiveCompanies.length.toLocaleString("en-IN")} companies match this view.</span><span>{filteredInactiveCompanies.length > displayedInactiveCompanies.length ? `Showing the first ${displayedInactiveCompanies.length}; search to locate a specific company.` : `Showing all ${displayedInactiveCompanies.length}.`}</span></div>
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[1080px] text-left">
                  <thead className="bg-white/[0.035] text-[9px] uppercase tracking-[0.13em] text-zinc-500"><tr><th className="px-4 py-3">Company</th><th className="px-4 py-3">Segment</th><th className="px-4 py-3">Current state</th><th className="px-4 py-3">6–1</th><th className="px-4 py-3">3 month</th><th className="px-4 py-3">Vs universe</th><th className="px-4 py-3">Vs sector</th><th className="px-4 py-3">Research</th></tr></thead>
                  <tbody className="divide-y divide-white/[0.07]">{displayedInactiveCompanies.map((company) => <tr key={company.symbol} className="hover:bg-white/[0.025]">
                    <td className="px-4 py-4"><div className="font-semibold text-white">{company.symbol}</div><div className="mt-1 max-w-[220px] truncate text-xs text-zinc-500">{company.company_name}</div></td>
                    <td className="px-4 py-4"><span className="rounded-full border border-violet-400/25 bg-violet-400/[0.08] px-2 py-1 text-[9px] font-black text-violet-200">{company.market_cap_segment.label}</span></td>
                    <td className="px-4 py-4"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${stateStyle[company.radar_state as RadarState]}`}>{company.radar_state}</span><div className="mt-2 max-w-[260px] text-[10px] leading-relaxed text-zinc-500">{stateMeaning[company.radar_state as RadarState]}</div></td>
                    <td className="px-4 py-4 font-mono text-sm">{pct(company.momentum_6_1)}</td><td className="px-4 py-4 font-mono text-sm">{pct(company.momentum_3m)}</td><td className="px-4 py-4 font-mono text-sm">{pct(company.relative_strength_to_universe)}</td><td className="px-4 py-4 font-mono text-sm">{pct(company.relative_strength_to_sector)}</td>
                    <td className="px-4 py-4"><button type="button" onClick={() => onDeepDive({ symbol: company.symbol, company_name: company.company_name, bms_status: lifecycleBySymbol.has(company.symbol) ? "ready" : studyBySymbol.has(company.symbol) ? "evidence_queued" : "not_queued" })} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-zinc-400 hover:border-gold/40 hover:text-gold"><BookOpen className="h-3.5 w-3.5" /> Explore company</button></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </div>
          </section>}
          {!filtered.length && <div className="py-16 text-center">
            <div className="text-sm font-semibold text-zinc-300">No companies match this combination of filters.</div>
            <div className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-zinc-500">The companies have not disappeared from the radar. This state, segment or gate intersection is empty. Return to the full universe to inspect every category.</div>
            <button type="button" onClick={() => { setFilter("ALL"); setSegment("ALL"); setQuery(""); }} className="mt-4 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200 hover:text-white">Show all active signals</button>
          </div>}
          {selectedStatusCompany && <section className="mt-6 rounded-3xl border border-amber-400/20 bg-amber-400/[0.035] p-5 md:p-6">
            <div className="flex items-start justify-between gap-4"><div><div className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-200">Evidence processing status</div><h2 className="mt-2 text-xl font-semibold text-white">{selectedStatusCompany.company_name} <span className="font-mono text-sm text-zinc-500">{selectedStatusCompany.symbol}</span></h2></div><button type="button" onClick={() => setSelectedStatusSymbol(null)} className="rounded-xl border border-white/10 p-2 text-zinc-500 hover:text-white" aria-label="Close processing status"><X className="h-4 w-4" /></button></div>
            <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-2xl border border-amber-400/20 bg-black/15 p-4"><div className="text-[9px] font-black uppercase tracking-[0.13em] text-zinc-500">Current state</div><div className="mt-2 text-sm font-bold text-amber-200">Evidence work queued</div></div><div className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="text-[9px] font-black uppercase tracking-[0.13em] text-zinc-500">Fundamental Change Score</div><div className="mt-2 text-sm font-bold text-zinc-300">Pending four-factor validation</div></div><div className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="text-[9px] font-black uppercase tracking-[0.13em] text-zinc-500">Lifecycle V2.1</div><div className="mt-2 text-sm font-bold text-zinc-300">Not activated</div></div></div>
            <p className="mt-4 max-w-4xl text-xs leading-relaxed text-zinc-400">The company has been prioritised for Earnings, Economics, Execution and Balance Sheet evidence work. A Fundamental Change Score will appear only after the four-factor evidence contract passes. Lifecycle will activate only when sufficient comparable reporting-period history is available. No score or trajectory is estimated while either gate remains incomplete.</p>
            <button type="button" onClick={() => onDeepDive({ symbol: selectedStatusCompany.symbol, company_name: selectedStatusCompany.company_name, bms_status: "evidence_queued" })} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gold/25 bg-gold/[0.08] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-gold hover:border-gold/50 hover:text-white"><BookOpen className="h-4 w-4" /> Research company while FCS is pending</button>
          </section>}
          {selectedStudy && latestCheckpoint && <section id="momentum-bms-study" className="scroll-mt-24 mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.035] overflow-hidden">
            <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-white/10 p-5 md:p-6">
              <div><div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Momentum-selected · evidence-qualified Fundamental Change study</div><h2 className="mt-2 text-2xl font-semibold text-white">{selectedStudy.company_name} <span className="font-mono text-base text-zinc-500">{selectedStudy.symbol}</span></h2><p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-400">Momentum determined research priority only. The Fundamental Change Score (BMS V2 methodology) and Lifecycle V2.1 classification below were calculated independently from four-factor company evidence.</p></div>
              <div className="flex items-center gap-2"><button type="button" onClick={() => onDeepDive({ symbol: selectedStudy.symbol, company_name: selectedStudy.company_name, bms_status: "ready" })} className="inline-flex items-center gap-2 rounded-xl border border-gold/25 bg-gold/[0.08] px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-gold hover:border-gold/50 hover:text-white"><BookOpen className="h-3.5 w-3.5" /> Open company deep dive</button><button type="button" onClick={() => setSelectedStudySymbol(null)} className="rounded-xl border border-white/10 p-2 text-zinc-500 hover:text-white" aria-label="Close Fundamental Change study"><X className="h-4 w-4" /></button></div>
            </header>
            <div className="p-5 md:p-6">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="text-[9px] font-black uppercase tracking-[0.13em] text-zinc-500">Lifecycle V2.1</div><div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black ${lifecycleStyle[selectedStudy.lifecycle_v2_1!]}`}>{selectedStudy.lifecycle_v2_1}</div><div className="mt-2 text-[10px] leading-relaxed text-zinc-500">{selectedStudy.lifecycle_reason?.replaceAll("_", " ")}</div></div>
                {selectedStudy.checkpoints.map((checkpoint) => <div key={checkpoint.checkpoint} className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="text-[9px] font-black uppercase tracking-[0.13em] text-zinc-500">{checkpoint.checkpoint}</div><div className="mt-2 text-3xl font-mono font-bold text-white">{checkpoint.display_score_v2}</div><div className="mt-1 text-[10px] text-zinc-500">Raw score {checkpoint.raw_score.toFixed(4)} · four factors complete</div></div>)}
              </div>
              <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                {latestCheckpoint.factors.map((factor) => <div key={factor.factor_id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="flex items-center justify-between gap-3"><div className="text-[10px] font-black uppercase tracking-[0.13em] text-zinc-300">{factor.factor_id.replaceAll("_", " ")}</div><div className={`font-mono text-sm font-bold ${factor.score >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{factor.score >= 0 ? "+" : ""}{factor.score.toFixed(2)}</div></div>{factor.impacts.map((impact) => <div key={impact.metric_id} className="mt-3 border-t border-white/[0.07] pt-3"><div className="text-[10px] font-semibold text-white">{impact.metric_id.replaceAll("_", " ")}</div><div className="mt-1 text-[10px] leading-relaxed text-zinc-500">{impact.previous_period}: {impact.previous_value} → {impact.current_period}: {impact.current_value} {impact.canonical_unit}</div><div className={`mt-1 text-[10px] font-mono ${impact.direction === "strengthens" ? "text-emerald-300" : impact.direction === "weakens" ? "text-rose-300" : "text-zinc-400"}`}>{impact.direction} · {impact.change_percentage >= 0 ? "+" : ""}{impact.change_percentage.toFixed(1)}%</div></div>)}</div>)}
              </div>
            </div>
          </section>}
          <div className="mt-5 rounded-2xl border border-violet-400/20 bg-violet-400/[0.035] p-4 text-xs leading-relaxed text-zinc-400"><strong className="text-violet-200">Research separation rule</strong><p className="mt-1">The company deep dive is independent research and is available before FCS completion. It does not alter the frozen Fundamental Change Score, Lifecycle V2.1 classification or momentum ranking.</p></div>
          <div className="mt-5 grid md:grid-cols-2 gap-3 text-xs leading-relaxed text-zinc-400">
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><TrendingUp className="w-4 h-4 text-cyan-300 mb-2" /><strong className="text-white">What the rank means</strong><p className="mt-1">A cross-sectional work-queue priority based on 12–1, 6–1 and 3-month momentum, Nifty 500 relative strength, trend structure, 52-week position and volume confirmation.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><ShieldAlert className="w-4 h-4 text-amber-300 mb-2" /><strong className="text-white">What it does not mean</strong><p className="mt-1">It is not a recommendation, expected return, FCS factor, lifecycle input or substitute for company evidence. Short-history companies remain unranked.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 md:col-span-2"><strong className="text-white">Operational selection gate</strong><p className="mt-1">Eligible means at least 252 sessions, a Starting or Confirmed radar state, no critical stale/provider flag, and the deterministic liquidity rule. The current threshold is {money(activeRadarData.summary.liquidity_universe?.threshold_inr ?? activeRadarData.selection_gate_policy.minimum_traded_value_inr)} median daily traded value over 60 sessions, with at least 90% trading frequency over 126 sessions. Extended setups are held back. Segment source date: {activeRadarData.segment_registry.as_of_date}.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 md:col-span-2"><strong className="text-white">Peer-relative strength</strong><p className="mt-1">“Vs universe” compares the company’s blended 6–1 and 3-month momentum with the median of its official large-, mid-, small-, micro-cap or Extended NSE peer group. “Vs sector” is shown only when an official NSE industry label exists and at least five peers are available.</p></div>
          </div>
        </div>
      </section>
    </div>
  </main>;
}
