import { useMemo, useState } from "react";
import { ArrowLeft, BarChart3, CalendarClock, Compass, Database, ShieldCheck, TriangleAlert } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import comparisonData from "../data/signalTrackerV2Comparison.json";

type Lifecycle = "Watch" | "Emerging" | "Building" | "Established" | "Recovering" | "Rebounding" | "Fading" | "Pending";
type PricePoint = { date: string; close: number; adjustedClose: number };
type Company = (typeof comparisonData.companies)[number];

const lifecycleOrder: Array<"All" | Lifecycle> = ["All", "Watch", "Emerging", "Building", "Recovering", "Rebounding", "Established", "Fading", "Pending"];
const lifecycleStyle: Record<Lifecycle, string> = {
  Watch: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  Emerging: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  Building: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  Recovering: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  Rebounding: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300",
  Established: "border-teal-400/30 bg-teal-400/10 text-teal-300",
  Fading: "border-orange-400/30 bg-orange-400/10 text-orange-300",
  Pending: "border-amber-300/30 bg-amber-300/10 text-amber-200",
};

const formatDate = (date: string) => new Intl.DateTimeFormat("en-IN", {
  day: "numeric", month: "short", year: "numeric",
}).format(new Date(`${date}T00:00:00`));
const percentage = (value: number | null) => value === null ? "Unavailable" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
const points = (value: number | null) => value === null ? "Unavailable" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} pp`;
const isTrajectoryBacked = (company: Company) => company.lifecycle_publishable === true;

function returnsFor(company: Company) {
  if (!company.priceHistory.length) return { company: null, nifty: null, sector: null, versusNifty: null, versusSector: null, comparisonDate: null };
  const nifty = comparisonData.benchmarks.NIFTY_50 as PricePoint[];
  const sector = (comparisonData.benchmarks as Record<string, PricePoint[]>)[company.sectorBenchmarkId] || [];
  const first = company.priceHistory[0];
  const availableEndDates = [company.priceHistory.at(-1)?.date, nifty.at(-1)?.date, sector.at(-1)?.date].filter(Boolean) as string[];
  const comparisonDate = availableEndDates.sort()[0] || first.date;
  const last = [...company.priceHistory].reverse().find((item) => item.date <= comparisonDate) || first;
  const niftyFirst = nifty.find((item) => item.date >= first.date);
  const niftyLast = [...nifty].reverse().find((item) => item.date <= comparisonDate);
  const sectorFirst = sector.find((item) => item.date >= first.date);
  const sectorLast = [...sector].reverse().find((item) => item.date <= comparisonDate);
  const companyReturn = last.adjustedClose / first.adjustedClose - 1;
  const niftyReturn = niftyFirst && niftyLast ? niftyLast.adjustedClose / niftyFirst.adjustedClose - 1 : null;
  const sectorReturn = sectorFirst && sectorLast ? sectorLast.adjustedClose / sectorFirst.adjustedClose - 1 : null;
  return {
    company: companyReturn,
    nifty: niftyReturn,
    sector: sectorReturn,
    versusNifty: niftyReturn === null ? null : companyReturn - niftyReturn,
    versusSector: sectorReturn === null ? null : companyReturn - sectorReturn,
    comparisonDate,
  };
}

function chartFor(company: Company) {
  const nifty = new Map((comparisonData.benchmarks.NIFTY_50 as PricePoint[]).map((item) => [item.date, item]));
  const sector = new Map(((comparisonData.benchmarks as Record<string, PricePoint[]>)[company.sectorBenchmarkId] || []).map((item) => [item.date, item]));
  const first = company.priceHistory[0];
  if (!first) return [];
  const sectorBase = sector.get(first.date)?.adjustedClose;
  const niftyBase = nifty.get(first.date)?.adjustedClose;
  const availableEndDates = [company.priceHistory.at(-1)?.date, [...nifty.keys()].at(-1), [...sector.keys()].at(-1)].filter(Boolean) as string[];
  const comparisonDate = availableEndDates.sort()[0] || first.date;
  const rows = company.priceHistory.filter((item) => item.date <= comparisonDate).map((item, session) => ({
    session,
    date: item.date,
    company: Number((item.adjustedClose / first.adjustedClose * 100).toFixed(2)),
    nifty: niftyBase && nifty.get(item.date) ? Number((nifty.get(item.date)!.adjustedClose / niftyBase * 100).toFixed(2)) : null,
    sector: sectorBase && sector.get(item.date) ? Number((sector.get(item.date)!.adjustedClose / sectorBase * 100).toFixed(2)) : null,
  }));
  for (let session = rows.length; session <= 60; session += 1) rows.push({ session, date: "", company: null as never, nifty: null, sector: null });
  return rows;
}

export default function SignalTrackerV2Comparison({ onShowFrozen, onShowMomentum }: { onShowFrozen: () => void; onShowMomentum: () => void }) {
  const companies = comparisonData.companies as Company[];
  const [filter, setFilter] = useState<"All" | Lifecycle>("All");
  const [query, setQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState(companies[0].symbol);
  const filtered = useMemo(() => companies.filter((company) => {
    const normalized = query.trim().toLowerCase();
    return (filter === "All" || company.lifecycle === filter)
      && (!normalized || company.symbol.toLowerCase().includes(normalized) || company.name.toLowerCase().includes(normalized));
  }), [companies, filter, query]);
  const selected = companies.find((company) => company.symbol === selectedSymbol) || companies[0];
  const selectedReturns = returnsFor(selected);
  const chart = useMemo(() => chartFor(selected), [selected]);

  const lifecycleSummary = useMemo(() => lifecycleOrder.slice(1).map((stage) => {
    const members = companies.filter((company) => company.lifecycle === stage);
    const observations = members.map(returnsFor).filter((item) => item.company !== null);
    const average = (key: "company" | "versusNifty") => observations.length
      ? observations.reduce((total, item) => total + (item[key] || 0), 0) / observations.length
      : null;
    return { stage, count: members.length, trajectory: members.filter(isTrajectoryBacked).length, averageReturn: average("company"), averageRelative: average("versusNifty") };
  }), [companies]);

  const chooseStage = (stage: "All" | Lifecycle) => {
    setFilter(stage);
    const first = stage === "All" ? companies[0] : companies.find((company) => company.lifecycle === stage);
    if (first) setSelectedSymbol(first.symbol);
  };

  return (
    <main className="min-h-screen bg-app-bg pt-24 pb-16 px-4 md:px-6 text-zinc-100">
      <div className="max-w-7xl mx-auto">
        <button type="button" onClick={onShowFrozen} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400 hover:text-white mb-7">
          <ArrowLeft className="w-4 h-4" /> View original frozen V1 study
        </button>
        <button type="button" onClick={onShowMomentum} className="ml-4 inline-flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.08] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200 hover:bg-cyan-400/[0.13]">
          <Compass className="w-4 h-4" /> Open 477-company momentum radar
        </button>

        <section className="rounded-[28px] border border-violet-400/20 bg-gradient-to-br from-[#0d1728] via-[#101a2b] to-[#0b1321] overflow-hidden shadow-2xl">
          <header className="px-5 py-6 md:px-8 md:py-8 border-b border-white/10">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300 mb-3">V2 controlled 50 · reconstructed shadow study</div>
                <h1 className="text-3xl md:text-5xl font-display font-semibold tracking-tight text-white">Fundamental Change Forward Comparison</h1>
                <p className="mt-2 text-xs text-zinc-500">Fundamental Change Score is calculated with the BMS V2 methodology.</p>
                <p className="mt-3 text-sm md:text-base text-zinc-400 max-w-3xl leading-relaxed">
                  Revised four-factor lifecycle ratings compared with genuine market prices from the first session after the 25 August information cutoff.
                </p>
              </div>
              <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-xs text-amber-100 max-w-md leading-relaxed">
                <strong className="block mb-1">Integrity boundary</strong>
                V2 was calculated later from evidence available by the cutoff. Its subsequent returns are real, but this is a reconstructed comparison—not a second contemporaneously frozen signal.
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-7">
              {[
                ["Companies", `${comparisonData.summary.companies}`, "Four-factor complete"],
                ["Trajectory-backed", `${comparisonData.summary.trajectory_backed}`, "Lifecycle V2.1 supported by 3 checkpoints"],
                ["Lifecycle pending", `${comparisonData.summary.lifecycle_pending}`, "Score complete; trajectory incomplete"],
                ["Forward record", `${comparisonData.forwardSessionsObserved} sessions`, `From ${formatDate(comparisonData.marketEntryDate)}`],
              ].map(([label, value, note]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.15em] font-black text-zinc-500">{label}</div>
                <div className="mt-2 text-xl font-semibold text-white">{value}</div>
                <div className="mt-1 text-xs text-zinc-500">{note}</div>
              </div>)}
            </div>
          </header>

          <div className="px-5 py-5 md:px-8 border-b border-white/10">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-white"><BarChart3 className="w-4 h-4 text-violet-300" /> Lifecycle-level forward comparison</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
              {lifecycleSummary.map((row) => <div key={row.stage} className="rounded-xl border border-white/10 bg-black/15 p-3">
                <div className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black uppercase ${lifecycleStyle[row.stage]}`}>{row.stage}</div>
                <div className="mt-2 text-xs text-zinc-400">{row.count} companies · {row.trajectory} trajectory-backed</div>
                <div className="mt-2 text-sm font-mono text-white">Return {percentage(row.averageReturn)}</div>
                <div className="text-[11px] font-mono text-zinc-400">vs Nifty {points(row.averageRelative)}</div>
              </div>)}
            </div>
          </div>

          <div className="grid lg:grid-cols-[390px_minmax(0,1fr)]">
            <aside className="border-b lg:border-b-0 lg:border-r border-white/10">
              <div className="p-5 border-b border-white/10">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol or company..." className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-violet-400/40" />
                <div className="mt-3 flex flex-wrap gap-2">
                  {lifecycleOrder.map((stage) => <button key={stage} type="button" onClick={() => chooseStage(stage)} className={`rounded-lg border px-2.5 py-1.5 text-[9px] font-black uppercase ${filter === stage ? "border-violet-300 bg-violet-300 text-slate-950" : "border-white/10 text-zinc-400"}`}>{stage}</button>)}
                </div>
              </div>
              <div className="max-h-[760px] overflow-y-auto divide-y divide-white/5">
                {filtered.map((company) => <button key={company.symbol} type="button" onClick={() => setSelectedSymbol(company.symbol)} className={`w-full p-4 text-left hover:bg-white/[0.035] ${selected.symbol === company.symbol ? "bg-violet-400/[0.07]" : ""}`}>
                  <div className="flex gap-3 justify-between">
                    <div className="min-w-0"><div className="font-semibold text-white truncate">{company.name}</div><div className="text-[10px] font-mono text-zinc-500 mt-1">{company.symbol} · score {company.display_score_v2}</div></div>
                    <span className={`h-fit rounded-full border px-2 py-1 text-[9px] font-black uppercase ${lifecycleStyle[company.lifecycle]}`}>{company.lifecycle}</span>
                  </div>
                  <div className={`mt-2 text-[9px] uppercase tracking-wider ${isTrajectoryBacked(company) ? "text-emerald-300" : "text-amber-200"}`}>{isTrajectoryBacked(company) ? "Trajectory-backed" : "Lifecycle pending"}</div>
                </button>)}
              </div>
            </aside>

            <section className="p-5 md:p-7 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div><div className="text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500">{selected.symbol} · V2 four-factor record</div><h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">{selected.name}</h2><div className={`inline-flex mt-3 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase ${lifecycleStyle[selected.lifecycle]}`}>{isTrajectoryBacked(selected) ? `V2 lifecycle: ${selected.lifecycle}` : "V2 lifecycle: Pending"}</div></div>
                <div className="sm:text-right"><div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">V2 display score</div><div className="text-3xl font-mono font-bold text-white mt-1">{selected.display_score_v2}</div><div className="text-xs text-zinc-500">Raw {selected.raw_score.toFixed(4)}</div></div>
              </div>

              <div className={`mt-5 rounded-2xl border p-4 ${isTrajectoryBacked(selected) ? "border-emerald-400/20 bg-emerald-400/[0.04]" : "border-amber-400/20 bg-amber-400/[0.04]"}`}>
                <div className="flex items-start gap-3">{isTrajectoryBacked(selected) ? <ShieldCheck className="w-5 h-5 text-emerald-300 shrink-0" /> : <TriangleAlert className="w-5 h-5 text-amber-200 shrink-0" />}<div><div className="text-sm font-semibold text-white">{isTrajectoryBacked(selected) ? `${selected.checkpoints} comparable V2 checkpoints` : "Lifecycle pending—not classified as Watch"}</div><p className="mt-1 text-xs leading-relaxed text-zinc-400">{isTrajectoryBacked(selected) ? `Lifecycle V2.1 is based on the recorded path ${selected.earlier_raw_score?.toFixed(4)} → ${selected.previous_raw_score?.toFixed(4)} → ${selected.raw_score.toFixed(4)}. ${selected.lifecycle_reason_code?.replaceAll("_", " ") || ""}` : "All four current factors and the current score are complete, but comparable V2 history is not yet long enough for a genuine trajectory classification."}</p>{isTrajectoryBacked(selected) && selected.lifecycle_changed_from_v1 ? <p className="mt-1 text-[11px] text-cyan-300">Corrected from the frozen legacy label {selected.frozen_lifecycle_v1}; the historical record remains preserved.</p> : null}</div></div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mt-5">
                {[["Company return", percentage(selectedReturns.company)], ["Versus Nifty 50", points(selectedReturns.versusNifty)], [`Versus ${selected.sectorBenchmarkLabel}`, points(selectedReturns.versusSector)]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3"><div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{label}</div><div className="mt-1 text-lg font-mono font-bold text-white">{value}</div></div>)}
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4 md:p-5">
                <div className="flex items-center justify-between gap-3 mb-4"><div><div className="text-sm font-semibold text-white">Forward market observation</div><div className="text-xs text-zinc-500 mt-1">Indexed to 100 at the first available session on/after {formatDate(comparisonData.marketEntryDate)} · future sessions are blank</div></div><CalendarClock className="w-5 h-5 text-violet-300" /></div>
                <div className="h-[310px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart}><CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} /><XAxis dataKey="session" domain={[0, 60]} type="number" ticks={[0, 20, 40, 60]} tick={{ fill: "#71717a", fontSize: 11 }} /><YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fill: "#71717a", fontSize: 11 }} /><Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.date ? formatDate(payload[0].payload.date) : "Not yet observed"} contentStyle={{ background: "#111827", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} /><ReferenceLine x={0} stroke="#a78bfa" strokeDasharray="4 4" label={{ value: "26 Aug entry", fill: "#a78bfa", fontSize: 10 }} /><Line type="monotone" dataKey="company" name={selected.symbol} stroke="#60a5fa" strokeWidth={2.5} dot={false} connectNulls /><Line type="monotone" dataKey="nifty" name="Nifty 50" stroke="#2dd4bf" strokeWidth={2} dot={false} connectNulls /><Line type="monotone" dataKey="sector" name={selected.sectorBenchmarkLabel} stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls /></LineChart></ResponsiveContainer></div>
              </div>

              <div className="mt-4 rounded-xl border border-sky-400/15 bg-sky-400/[0.035] px-4 py-3 text-xs leading-relaxed text-zinc-400"><Database className="inline w-4 h-4 text-sky-300 mr-2" />Prices are unadjusted/adjusted daily observations recorded from Yahoo’s chart feed; unavailable or unreconciled benchmark extensions remain unavailable. This comparison is aligned through {selectedReturns.comparisonDate ? formatDate(selectedReturns.comparisonDate) : "the latest shared session"}. This market-data layer does not change any V2 factor score or lifecycle.</div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
