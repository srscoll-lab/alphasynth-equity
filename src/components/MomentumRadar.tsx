import { useMemo, useState } from "react";
import { ArrowLeft, Compass, Search, ShieldAlert, TrendingUp } from "lucide-react";
import radarData from "../data/bmsMomentumRadar.json";

type RadarState = "DORMANT" | "STARTING" | "CONFIRMED" | "EXTENDED" | "DETERIORATING" | "INSUFFICIENT_HISTORY";
type Company = (typeof radarData.companies)[number];

const states: Array<"ALL" | RadarState> = ["ALL", "STARTING", "CONFIRMED", "EXTENDED", "DORMANT", "DETERIORATING", "INSUFFICIENT_HISTORY"];
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

export default function MomentumRadar({ onBack }: { onBack: () => void }) {
  const companies = radarData.companies as Company[];
  const [filter, setFilter] = useState<"ALL" | RadarState>("STARTING");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return companies.filter((company) => (filter === "ALL" || company.radar_state === filter)
      && (!normalized || company.symbol.toLowerCase().includes(normalized) || company.company_name.toLowerCase().includes(normalized)));
  }, [companies, filter, query]);

  return <main className="min-h-screen bg-app-bg pt-24 pb-16 px-4 md:px-6 text-zinc-100">
    <div className="max-w-7xl mx-auto">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400 hover:text-white mb-7">
        <ArrowLeft className="w-4 h-4" /> Back to BMS V2
      </button>
      <section className="rounded-[28px] border border-cyan-400/20 bg-gradient-to-br from-[#0d1728] via-[#101a2b] to-[#0b1321] overflow-hidden shadow-2xl">
        <header className="px-5 py-6 md:px-8 md:py-8 border-b border-white/10">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300 mb-3"><Compass className="w-4 h-4" /> 477-company discovery layer</div>
              <h1 className="text-3xl md:text-5xl font-display font-semibold tracking-tight text-white">Momentum Radar</h1>
              <p className="mt-3 text-sm md:text-base text-zinc-400 max-w-3xl leading-relaxed">A deterministic market-guided queue for deciding which companies should receive BMS evidence work next. It does not alter BMS scores or lifecycles.</p>
            </div>
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-xs text-amber-100 max-w-md leading-relaxed">
              <strong className="block mb-1">Experimental—not a return forecast</strong>
              Rankings use provisional adjusted market data and require walk-forward validation before they can become a product gate or investment signal.
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-7">
            {[
              ["Universe scanned", `${radarData.universe.scanned}`, "Exact monitored BMS universe"],
              ["Full history", `${radarData.summary.full_history}`, "Eligible for comparable ranking"],
              ["Starting", `${radarData.summary.state_counts.STARTING}`, "Early setups for evidence priority"],
              ["Confirmed", `${radarData.summary.state_counts.CONFIRMED}`, `Market data through ${radarData.market_data.as_of_date}`],
            ].map(([label, value, note]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.15em] font-black text-zinc-500">{label}</div><div className="mt-2 text-2xl font-mono font-bold text-white">{value}</div><div className="mt-1 text-xs text-zinc-500">{note}</div>
            </div>)}
          </div>
        </header>

        <div className="px-5 py-5 md:px-8 border-b border-white/10">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {states.map((state) => <button key={state} type="button" onClick={() => setFilter(state)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] ${filter === state ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-zinc-500 hover:text-white"}`}>{state.replaceAll("_", " ")} {state === "ALL" ? companies.length : companies.filter((company) => company.radar_state === state).length}</button>)}
            </div>
            <label className="relative block lg:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol or company" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-300/40" /></label>
          </div>
        </div>

        <div className="p-5 md:p-8">
          <div className="rounded-2xl border border-white/10 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-white/[0.035] text-[9px] uppercase tracking-[0.13em] text-zinc-500"><tr><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">State</th><th className="px-4 py-3">12–1</th><th className="px-4 py-3">6–1</th><th className="px-4 py-3">3 month</th><th className="px-4 py-3">Relative strength</th><th className="px-4 py-3">52w high</th><th className="px-4 py-3">20d traded value</th></tr></thead>
              <tbody className="divide-y divide-white/[0.07]">{filtered.map((company) => <tr key={company.symbol} className="hover:bg-white/[0.025]">
                <td className="px-4 py-4 font-mono font-bold text-white">{company.experimental_rank_score ?? "—"}</td>
                <td className="px-4 py-4"><div className="font-semibold text-white">{company.symbol}</div><div className="mt-1 text-xs text-zinc-500 max-w-[220px] truncate">{company.company_name}</div></td>
                <td className="px-4 py-4"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${stateStyle[company.radar_state as RadarState]}`}>{company.radar_state.replaceAll("_", " ")}</span><div className="mt-2 max-w-[230px] text-[10px] leading-relaxed text-zinc-500">{stateMeaning[company.radar_state as RadarState]}</div></td>
                <td className="px-4 py-4 font-mono text-sm">{pct(company.momentum_12_1)}</td><td className="px-4 py-4 font-mono text-sm">{pct(company.momentum_6_1)}</td><td className="px-4 py-4 font-mono text-sm">{pct(company.momentum_3m)}</td><td className="px-4 py-4 font-mono text-sm">{pct(company.relative_strength)}</td><td className="px-4 py-4 font-mono text-sm">{pct(company.distance_from_52w_high)}</td><td className="px-4 py-4 font-mono text-sm">{money(company.average_traded_value_20)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {!filtered.length && <div className="py-16 text-center text-sm text-zinc-500">No companies match this filter.</div>}
          <div className="mt-5 grid md:grid-cols-2 gap-3 text-xs leading-relaxed text-zinc-400">
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><TrendingUp className="w-4 h-4 text-cyan-300 mb-2" /><strong className="text-white">What the rank means</strong><p className="mt-1">A cross-sectional work-queue priority based on 12–1, 6–1 and 3-month momentum, Nifty 500 relative strength, trend structure, 52-week position and volume confirmation.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><ShieldAlert className="w-4 h-4 text-amber-300 mb-2" /><strong className="text-white">What it does not mean</strong><p className="mt-1">It is not a recommendation, expected return, BMS factor, lifecycle input or substitute for company evidence. Short-history companies remain unranked.</p></div>
          </div>
        </div>
      </section>
    </div>
  </main>;
}
