import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpenCheck, Calculator, FileCheck2, Library, Search, ShieldCheck } from "lucide-react";
import { fundamentalChangeLibrary, type FundamentalChangeRecord } from "../data/fundamentalChangeLibrary";
import scoreDetails from "../data/fundamentalChangeScoreDetails.json";

type SortKey = "fcsScore" | "momentumScore" | "companyName" | "fcsAsOf";
type SortDirection = "asc" | "desc";

type ScoreImpact = {
  metric_id: string;
  direction: "strengthens" | "weakens" | "neutral";
  previous_value: number | null;
  current_value: number | null;
  canonical_unit: string | null;
  change_percentage: number | null;
  css_score: number | null;
  evidence_confidence: number | null;
  comparison_basis: string | null;
  previous_period: string | null;
  current_period: string | null;
  interpretation: string | null;
  document_id: string | null;
  source_page: number | null;
  quoted_label: string | null;
};

type ScoreFactor = {
  factor_id: string;
  weight: number;
  score: number;
  contradiction: boolean;
  evidence_count: number;
  strengthens_count: number;
  weakens_count: number;
  neutral_count: number;
  impacts: ScoreImpact[];
};

type ScoreDetail = {
  symbol: string;
  display_score_v2: number;
  raw_score: number;
  evidence_count: number;
  lifecycle_status: string;
  source_gate: string;
  source_artifact: string;
  factors: ScoreFactor[];
};

const scoreDetailBySymbol = new Map((scoreDetails.records as ScoreDetail[]).map((record) => [record.symbol, record]));

const pct = (value: number | null) => value === null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

const momentumStyle: Record<string, string> = {
  STARTING: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  CONFIRMED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  EXTENDED: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  DETERIORATING: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  DORMANT: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  INSUFFICIENT_HISTORY: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  UNAVAILABLE: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
};

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export default function FundamentalChangeLibrary({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [momentumState, setMomentumState] = useState("ALL");
  const [capSegment, setCapSegment] = useState("ALL");
  const [readiness, setReadiness] = useState<"ALL" | "LIFECYCLE_READY" | "FCS_ONLY">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("fcsScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const momentumStates = useMemo(() => unique(fundamentalChangeLibrary.map((record) => record.momentumState)), []);
  const capSegments = useMemo(() => unique(fundamentalChangeLibrary.map((record) => record.capSegment)), []);
  const records = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return fundamentalChangeLibrary
      .filter((record) => (!normalized || record.symbol.toLowerCase().includes(normalized) || record.companyName.toLowerCase().includes(normalized)))
      .filter((record) => momentumState === "ALL" || record.momentumState === momentumState)
      .filter((record) => capSegment === "ALL" || record.capSegment === capSegment)
      .filter((record) => readiness === "ALL" || (readiness === "LIFECYCLE_READY" ? record.lifecycleReady : !record.lifecycleReady))
      .sort((left, right) => {
        const direction = sortDirection === "asc" ? 1 : -1;
        const leftValue = left[sortKey];
        const rightValue = right[sortKey];
        if (leftValue === null) return 1;
        if (rightValue === null) return -1;
        return (typeof leftValue === "number"
          ? leftValue - (rightValue as number)
          : String(leftValue).localeCompare(String(rightValue))) * direction;
      });
  }, [capSegment, momentumState, query, readiness, sortDirection, sortKey]);

  const lifecycleReadyCount = fundamentalChangeLibrary.filter((record) => record.lifecycleReady).length;
  const setSort = (key: SortKey) => {
    if (key === sortKey) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDirection(key === "companyName" ? "asc" : "desc");
    }
  };
  const SortIcon = sortDirection === "asc" ? ArrowUp : ArrowDown;
  const sortButton = (key: SortKey, children: string) => (
    <button type="button" onClick={() => setSort(key)} className="inline-flex items-center gap-1.5 hover:text-white">
      {children}{sortKey === key && <SortIcon className="h-3 w-3" />}
    </button>
  );

  const selectedRecord = selectedSymbol ? fundamentalChangeLibrary.find((record) => record.symbol === selectedSymbol) : null;
  const selectedDetail = selectedSymbol ? scoreDetailBySymbol.get(selectedSymbol) : null;
  if (selectedRecord && selectedDetail) {
    return <ScoreDetailView record={selectedRecord} detail={selectedDetail} onBack={() => setSelectedSymbol(null)} />;
  }

  return <main className="min-h-screen bg-app-bg px-4 pb-16 pt-24 text-zinc-100 md:px-6">
    <div className="mx-auto max-w-7xl">
      <button type="button" onClick={onBack} className="mb-7 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to Momentum Radar
      </button>

      <section className="overflow-hidden rounded-[28px] border border-emerald-400/20 bg-gradient-to-br from-[#0d1728] via-[#101a2b] to-[#0b1321] shadow-2xl">
        <header className="border-b border-white/10 px-5 py-6 md:px-8 md:py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300"><Library className="h-4 w-4" /> Research library</div>
              <h1 className="text-3xl font-display font-semibold tracking-tight text-white md:text-5xl">Fundamental Change Library</h1>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400 md:text-base">Compare every currently available four-factor Fundamental Change Score at a glance, alongside each company’s separate Momentum Radar classification.</p>
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-500">Fundamental Change Score uses the BMS V2 methodology. It measures reported business change; the Momentum Radar score measures market behaviour. The two scores are not interchangeable.</p>
            </div>
            <div className="max-w-md rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-xs leading-relaxed text-amber-100"><strong className="mb-1 block">Research comparison—not a recommendation</strong>Sorting does not create an investment ranking. Dates, lifecycle readiness and market state remain visible so unlike records are not mistaken for equivalent signals.</div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {[
              ["Four-factor FCS records", fundamentalChangeLibrary.length, "Controlled validation, momentum expansion and final-build studies"],
              ["Lifecycle ready", lifecycleReadyCount, "Three comparable checkpoints available"],
              ["FCS only", fundamentalChangeLibrary.length - lifecycleReadyCount, "Score ready; trajectory remains pending"],
            ].map(([title, value, copy]) => <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-500">{title}</div><div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div><div className="mt-1 text-xs text-zinc-500">{copy}</div></div>)}
          </div>
        </header>

        <div className="border-b border-white/10 px-5 py-5 md:px-8">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="relative xl:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company or symbol" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-emerald-300/40" /></label>
            <select value={momentumState} onChange={(event) => setMomentumState(event.target.value)} aria-label="Filter by momentum state" className="rounded-xl border border-white/10 bg-[#101827] px-3 py-2.5 text-xs text-zinc-200 outline-none"><option value="ALL">All momentum states</option>{momentumStates.map((state) => <option key={state} value={state}>{label(state)}</option>)}</select>
            <select value={capSegment} onChange={(event) => setCapSegment(event.target.value)} aria-label="Filter by market-cap segment" className="rounded-xl border border-white/10 bg-[#101827] px-3 py-2.5 text-xs text-zinc-200 outline-none"><option value="ALL">All cap segments</option>{capSegments.map((segment) => <option key={segment} value={segment}>{segment}</option>)}</select>
            <select value={readiness} onChange={(event) => setReadiness(event.target.value as typeof readiness)} aria-label="Filter by lifecycle readiness" className="rounded-xl border border-white/10 bg-[#101827] px-3 py-2.5 text-xs text-zinc-200 outline-none"><option value="ALL">All readiness</option><option value="LIFECYCLE_READY">FCS + lifecycle ready</option><option value="FCS_ONLY">FCS ready · lifecycle pending</option></select>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-zinc-500"><span>{records.length} of {fundamentalChangeLibrary.length} records shown</span><span>Sorted by {sortKey === "fcsScore" ? "FCS" : sortKey === "momentumScore" ? "Momentum Radar score" : sortKey === "companyName" ? "company" : "FCS date"} · {sortDirection === "asc" ? "ascending" : "descending"}</span></div>
        </div>

        <div className="overflow-x-auto p-5 md:p-8">
          <table className="w-full min-w-[1500px] text-left">
            <thead className="text-[9px] uppercase tracking-[0.13em] text-zinc-500"><tr className="border-b border-white/10"><th className="px-3 py-3">{sortButton("companyName", "Company")}</th><th className="px-3 py-3">Segment</th><th className="px-3 py-3">Sector</th><th className="px-3 py-3">{sortButton("fcsScore", "FCS")}</th><th className="px-3 py-3">FCS period / as of</th><th className="px-3 py-3">Evidence</th><th className="px-3 py-3">Lifecycle</th><th className="px-3 py-3">Momentum state</th><th className="px-3 py-3">{sortButton("momentumScore", "Momentum score")}</th><th className="px-3 py-3">Vs universe</th><th className="px-3 py-3">Vs sector</th><th className="px-3 py-3">Momentum as of</th><th className="px-3 py-3">Report</th></tr></thead>
            <tbody className="divide-y divide-white/[0.07]">{records.map((record) => <RecordRow key={record.symbol} record={record} onOpen={() => setSelectedSymbol(record.symbol)} />)}</tbody>
          </table>
          {!records.length && <div className="py-14 text-center text-sm text-zinc-500">No Fundamental Change records match these filters.</div>}
        </div>
      </section>
    </div>
  </main>;
}

function RecordRow({ record, onOpen }: { record: FundamentalChangeRecord; onOpen: () => void }) {
  return <tr className="hover:bg-white/[0.025]">
    <td className="px-3 py-4"><div className="font-semibold text-white">{record.symbol}</div><div className="mt-1 max-w-[220px] truncate text-xs text-zinc-500">{record.companyName}</div></td>
    <td className="px-3 py-4"><span className="rounded-full border border-violet-400/25 bg-violet-400/[0.08] px-2 py-1 text-[9px] font-black text-violet-200">{record.capSegment}</span></td>
    <td className="px-3 py-4 max-w-[170px] text-xs text-zinc-400">{record.sector}</td>
    <td className="px-3 py-4"><div className="font-mono text-xl font-bold text-emerald-200">{record.fcsScore}</div><div className="mt-1 text-[9px] text-zinc-600">BMS V2 method</div></td>
    <td className="px-3 py-4"><div className="text-xs text-zinc-300">{record.fcsPeriod}</div><div className="mt-1 text-[10px] text-zinc-600">{record.fcsAsOf.slice(0, 10)}</div></td>
    <td className="px-3 py-4"><span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> Four-factor ready</span></td>
    <td className="px-3 py-4">{record.lifecycleReady ? <><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-200"><BookOpenCheck className="h-3.5 w-3.5" /> {record.lifecycle}</span><div className="mt-1 text-[9px] text-zinc-600">{record.checkpoints}/3 checkpoints</div></> : <><span className="text-xs text-zinc-500">Pending</span><div className="mt-1 text-[9px] text-zinc-600">{record.checkpoints}/3 checkpoints</div></>}</td>
    <td className="px-3 py-4"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${momentumStyle[record.momentumState]}`}>{label(record.momentumState)}</span></td>
    <td className="px-3 py-4 font-mono text-sm text-white">{record.momentumScore ?? "—"}</td>
    <td className="px-3 py-4 font-mono text-sm text-zinc-300">{pct(record.universeRelativeStrength)}</td>
    <td className="px-3 py-4 font-mono text-sm text-zinc-300">{pct(record.sectorRelativeStrength)}</td>
    <td className="px-3 py-4 text-xs text-zinc-500">{record.momentumAsOf}</td>
    <td className="px-3 py-4"><button type="button" onClick={onOpen} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-300/25 bg-emerald-300/[0.08] px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-200 hover:bg-emerald-300/[0.14]">View score <ArrowRight className="h-3.5 w-3.5" /></button></td>
  </tr>;
}

const factorNames: Record<string, string> = {
  earnings: "Earnings",
  economics: "Economics",
  execution: "Execution",
  balance_sheet: "Balance Sheet",
};

const factorCopy: Record<string, string> = {
  earnings: "Reported earnings direction and quality",
  economics: "Underlying margins, pricing and business economics",
  execution: "Operating delivery against measurable business outputs",
  balance_sheet: "Financial resilience, leverage and cash-generation evidence",
};

const formatMetric = (value: string) => label(value);
const formatNumber = (value: number | null, unit: string | null) => {
  if (value === null) return "Not carried in score export";
  const rendered = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
  return unit ? `${rendered} ${unit}` : rendered;
};
const directionStyle: Record<string, string> = {
  strengthens: "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200",
  weakens: "border-rose-400/25 bg-rose-400/[0.08] text-rose-200",
  neutral: "border-zinc-400/25 bg-zinc-400/[0.08] text-zinc-300",
};

function ScoreDetailView({ record, detail, onBack }: { record: FundamentalChangeRecord; detail: ScoreDetail; onBack: () => void }) {
  return <main className="min-h-screen bg-app-bg px-4 pb-16 pt-24 text-zinc-100 md:px-6">
    <div className="mx-auto max-w-7xl">
      <button type="button" onClick={onBack} className="mb-7 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to Fundamental Change Library</button>
      <section className="overflow-hidden rounded-[28px] border border-emerald-400/20 bg-gradient-to-br from-[#0d1728] via-[#101a2b] to-[#0b1321] shadow-2xl">
        <header className="border-b border-white/10 px-5 py-6 md:px-8 md:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300"><Calculator className="h-4 w-4" /> Fundamental Change Score report</div>
              <h1 className="text-3xl font-semibold text-white md:text-5xl">{record.companyName}</h1>
              <div className="mt-2 font-mono text-sm text-zinc-500">{record.symbol} · {record.fcsPeriod} · evidence as of {record.fcsAsOf.slice(0, 10)}</div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-400">The score below is generated from four independently qualified factors using the frozen BMS V2 weighting policy. Momentum Radar data is shown as separate context and does not enter this calculation.</p>
            </div>
            <div className="grid min-w-[280px] grid-cols-2 gap-3">
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-200">FCS</div><div className="mt-2 font-mono text-4xl font-bold text-white">{detail.display_score_v2}</div><div className="mt-1 text-[10px] text-zinc-500">BMS V2 full-range display</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">Weighted raw score</div><div className="mt-2 font-mono text-2xl font-bold text-white">{detail.raw_score.toFixed(4)}</div><div className="mt-1 text-[10px] text-zinc-500">{detail.evidence_count} qualified evidence item{detail.evidence_count === 1 ? "" : "s"}</div></div>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">Lifecycle</div><div className="mt-2 text-sm font-semibold text-white">{record.lifecycleReady ? record.lifecycle : "Pending"}</div><div className="mt-1 text-xs text-zinc-500">{record.lifecycleReady ? `${record.checkpoints}/3 comparable checkpoints` : `${record.checkpoints}/3 checkpoints · no trajectory inferred`}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">Momentum Radar</div><div className="mt-2 text-sm font-semibold text-white">{label(record.momentumState)} · {record.momentumScore ?? "—"}</div><div className="mt-1 text-xs text-zinc-500">Separate market-behaviour signal as of {record.momentumAsOf}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">Scoring policy</div><div className="mt-2 text-sm font-semibold text-white">27.78% / 27.78% / 27.78% / 16.66%</div><div className="mt-1 text-xs text-zinc-500">Earnings · Economics · Execution · Balance Sheet</div></div>
          </div>
        </header>

        <div className="space-y-5 p-5 md:p-8">
          {detail.factors.map((factor) => <section key={factor.factor_id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div><div className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300">{factorNames[factor.factor_id]}</div><h2 className="mt-2 text-xl font-semibold text-white">{factorCopy[factor.factor_id]}</h2><div className="mt-2 text-xs text-zinc-500">{factor.evidence_count} evidence item{factor.evidence_count === 1 ? "" : "s"} · {factor.strengthens_count} strengthens · {factor.weakens_count} weakens{factor.contradiction ? " · conflicting evidence retained" : ""}</div></div>
              <div className="flex gap-3"><div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-right"><div className="text-[9px] uppercase tracking-wider text-zinc-600">Factor score</div><div className="mt-1 font-mono text-xl font-bold text-white">{factor.score.toFixed(2)}</div></div><div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-right"><div className="text-[9px] uppercase tracking-wider text-zinc-600">Weight</div><div className="mt-1 font-mono text-xl font-bold text-white">{(factor.weight * 100).toFixed(2)}%</div></div></div>
            </div>
            <div className="mt-5 grid gap-3 xl:grid-cols-2">{factor.impacts.map((impact, index) => <article key={`${impact.metric_id}-${index}`} className="rounded-xl border border-white/[0.08] bg-black/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold text-white">{formatMetric(impact.metric_id)}</div><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${directionStyle[impact.direction]}`}>{impact.direction}</span></div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><div className="text-[9px] uppercase tracking-wider text-zinc-600">Previous · {impact.previous_period ?? "period in evidence ledger"}</div><div className="mt-1 font-mono text-zinc-200">{formatNumber(impact.previous_value, impact.canonical_unit)}</div></div><div><div className="text-[9px] uppercase tracking-wider text-zinc-600">Current · {impact.current_period ?? record.fcsPeriod}</div><div className="mt-1 font-mono text-zinc-200">{formatNumber(impact.current_value, impact.canonical_unit)}</div></div></div>
              <div className="mt-4 flex flex-wrap gap-2 text-[10px]"><span className="rounded-lg border border-white/10 px-2 py-1 text-zinc-400">Change {impact.change_percentage === null ? "—" : `${impact.change_percentage >= 0 ? "+" : ""}${impact.change_percentage.toFixed(2)}%`}</span><span className="rounded-lg border border-white/10 px-2 py-1 text-zinc-400">CSS {impact.css_score?.toFixed(2) ?? "—"}</span><span className="rounded-lg border border-white/10 px-2 py-1 text-zinc-400">Confidence {impact.evidence_confidence === null ? "—" : `${Math.round(impact.evidence_confidence * 100)}%`}</span></div>
              {impact.interpretation && <p className="mt-3 text-xs leading-relaxed text-amber-100/70">{impact.interpretation}</p>}
              {(impact.quoted_label || impact.document_id) && <div className="mt-3 border-t border-white/[0.07] pt-3 text-[10px] leading-relaxed text-zinc-600"><FileCheck2 className="mr-1 inline h-3.5 w-3.5" />{impact.quoted_label ?? "Hash-pinned evidence document"}{impact.source_page !== null ? ` · page ${impact.source_page}` : ""}{impact.document_id ? <div className="mt-1 break-all font-mono">{impact.document_id}</div> : null}</div>}
            </article>)}</div>
          </section>)}
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-xs leading-relaxed text-zinc-400"><strong className="text-amber-100">Interpretation boundary.</strong> FCS measures reported fundamental change; it is not a valuation conclusion, expected-return forecast or recommendation. The lifecycle requires three comparable checkpoints and remains pending where that evidence does not yet exist.</div>
        </div>
      </section>
    </div>
  </main>;
}
