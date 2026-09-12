import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileCheck2,
  Gauge,
  LockKeyhole,
  Search,
  ShieldCheck,
  SearchCheck,
  TriangleAlert,
  UserRoundCheck,
  Workflow,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import frozenCohortData from "../data/signalTrackerCohort001.json";
import SignalEvidenceLayer from "./SignalEvidenceLayer";

type Lifecycle =
  | "Watch"
  | "Emerging"
  | "Building"
  | "Established"
  | "Fading";

type TrackerSection = "overview" | "explanation" | "methodology";

type QualificationStatus =
  | "qualified"
  | "qualified_with_caution"
  | "not_qualified"
  | "insufficient_evidence";

type TrackerView = "all" | "qualified";

type PrototypeCompany = {
  symbol: string;
  name: string;
  lifecycle: Lifecycle;
  rawBms: number;
  bmsChange: number;
  evidenceStrength: "Limited" | "Moderate" | "High";
  evidenceCount: number;
  period: string;
  marketCap: number;
  marketCapRankWithinLifecycle: number;
  sectorBenchmarkId: string;
  sectorBenchmarkLabel: string;
  resultDate: string;
  resultEntryDate: string | null;
  resultDateSourceUrl: string;
  resultDateSourceType: string;
  resultDateStatus: string;
  resultInterpretation: string;
  priceHistory: PriceObservation[];
  qualificationStatus?: QualificationStatus;
  qualificationAsOf?: string;
  qualificationReasons?: string[];
  managementDeliveryLabel?: string;
  managementDeliveryScore?: number;
  managementDeliveryConfidence?: "Low" | "Medium" | "High" | "Insufficient";
  measurableDeliveryDirection?: "ahead" | "in_line" | "mixed" | "behind" | "unknown";
  qualityGatesObserved?: number;
  qualityGatesTotal?: number;
  qualityGateReasons?: string[];
};

type PriceObservation = {
  date: string;
  close: number;
  adjustedClose: number;
};

type CohortData = typeof frozenCohortData;
type DeliveredCohortData = CohortData & { deliverySource?: "cloud" | "frozen-fallback" };

type ChartPoint = {
  session: number;
  date?: string;
  company: number | null;
  nifty: number | null;
  sector: number | null;
  actualCompany: number | null;
  actualNifty: number | null;
  actualSector: number | null;
};

const lifecycleOrder: Array<"All" | Lifecycle> = [
  "All",
  "Watch",
  "Emerging",
  "Building",
  "Established",
  "Fading",
];

const lifecycleStages: Lifecycle[] = ["Watch", "Emerging", "Building", "Established", "Fading"];

const lifecycleStyle: Record<Lifecycle, string> = {
  Watch: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  Emerging: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  Building: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  Established: "border-teal-400/30 bg-teal-400/10 text-teal-300",
  Fading: "border-orange-400/30 bg-orange-400/10 text-orange-300",
};

const lifecycleMeaning: Record<Lifecycle, string> = {
  Watch: "No sufficiently strong directional change is confirmed. Continue monitoring.",
  Emerging: "Early improvement is visible. Prioritise the company for independent research.",
  Building: "Improvement appears broader or stronger. Test sustainability and valuation.",
  Established: "Positive momentum is well developed. Monitor durability and expectations.",
  Fading: "Previously positive business momentum appears to be weakening. This is not an automatic sell signal.",
};

const qualificationCopy: Record<QualificationStatus, { label: string; style: string }> = {
  qualified: {
    label: "Ready for deeper research",
    style: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  },
  qualified_with_caution: {
    label: "Research with caution",
    style: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  },
  not_qualified: {
    label: "Not ready for shortlist",
    style: "border-red-400/30 bg-red-400/10 text-red-300",
  },
  insufficient_evidence: {
    label: "More evidence needed",
    style: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
  },
};

const deliveryDirectionLabel: Record<NonNullable<PrototypeCompany["measurableDeliveryDirection"]>, string> = {
  ahead: "Ahead",
  in_line: "In line",
  mixed: "Mixed",
  behind: "Behind",
  unknown: "Unknown",
};

const qualificationStatus = (company: PrototypeCompany): QualificationStatus =>
  company.qualificationStatus ?? "insufficient_evidence";

const score100 = (value: number) =>
  Math.max(0, Math.min(100, Math.round(50 + (value / 0.75) * 50)));

const percentage = (value: number) =>
  `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

const percentagePoints = (value: number) =>
  `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} pp`;

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`));

const formatMarketCap = (value: number) => `₹${(value / 1_000_000_000_000).toFixed(2)}T`;

const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);

function genuineSeries(
  company: PrototypeCompany,
  cohortData: CohortData,
  benchmarks: Record<string, PriceObservation[]>,
) {
  const signalDate = cohortData.signalDate;
  const reconstructionStart = company.resultEntryDate || company.resultDate;
  const companyByDate = new Map(company.priceHistory.map((point) => [point.date, point]));
  const niftyByDate = new Map((benchmarks.NIFTY_50 || []).map((point) => [point.date, point]));
  const sectorByDate = new Map((benchmarks[company.sectorBenchmarkId] || []).map((point) => [point.date, point]));
  const officialMarketDates = (benchmarks.NIFTY_50 || [])
    .filter((point) => point.date >= reconstructionStart)
    .map((point) => point.date);
  const historyDates = officialMarketDates.filter((value) => value <= signalDate);
  const forwardDates = officialMarketDates.filter((value) => value > signalDate).slice(0, 60);
  const observedDates = [...historyDates, ...forwardDates];
  const companyBasePoint = observedDates.map((value) => companyByDate.get(value)).find(Boolean);
  const sectorBasePoint = observedDates.map((value) => sectorByDate.get(value)).find(Boolean);
  const companyBase = companyBasePoint?.adjustedClose || 1;
  const niftyBase = niftyByDate.get(observedDates[0] || "")?.adjustedClose || 1;
  const sectorBase = sectorBasePoint?.adjustedClose || 1;
  const historyOffset = historyDates.length - 1;

  const points: ChartPoint[] = observedDates.map((marketDate, index) => {
    const companyPoint = companyByDate.get(marketDate);
    const niftyPoint = niftyByDate.get(marketDate);
    const sectorPoint = sectorByDate.get(marketDate);
    return {
      session: index - historyOffset,
      date: marketDate,
      company: companyPoint ? Number(((companyPoint.adjustedClose / companyBase) * 100).toFixed(2)) : null,
      nifty: niftyPoint ? Number(((niftyPoint.adjustedClose / niftyBase) * 100).toFixed(2)) : null,
      sector: sectorPoint ? Number(((sectorPoint.adjustedClose / sectorBase) * 100).toFixed(2)) : null,
      actualCompany: companyPoint?.close ?? null,
      actualNifty: niftyPoint?.close ?? null,
      actualSector: sectorPoint?.close ?? null,
    };
  });

  for (let session = forwardDates.length + 1; session <= 60; session += 1) {
    points.push({ session, company: null, nifty: null, sector: null, actualCompany: null, actualNifty: null, actualSector: null });
  }
  return {
    points,
    observedForwardSessions: forwardDates.length,
    resultMarkerSession: -historyOffset,
  };
}

type SignalTrackerProps = {
  onBack: () => void;
};

export default function SignalTracker({ onBack }: SignalTrackerProps) {
  const [cohortData, setCohortData] = useState<CohortData>(frozenCohortData);
  const [dataSource, setDataSource] = useState<"cloud" | "frozen-fallback">("frozen-fallback");
  const [filter, setFilter] = useState<"All" | Lifecycle>("Emerging");
  const [query, setQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("SUNPHARMA");
  const [priceMode, setPriceMode] = useState<"indexed" | "actual">("indexed");
  const [activeSection, setActiveSection] = useState<TrackerSection>("overview");
  const [trackerView, setTrackerView] = useState<TrackerView>("all");
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/forward-validation", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Tracker data request failed: ${response.status}`);
        return response.json();
      })
      .then((payload: DeliveredCohortData) => {
        if (!active || payload.cohortId !== frozenCohortData.cohortId) return;
        setCohortData(payload);
        setDataSource(payload.deliverySource === "cloud" ? "cloud" : "frozen-fallback");
      })
      .catch((error) => {
        console.warn("Using the frozen tracker snapshot because live cloud data is unavailable.", error);
      });
    return () => { active = false; };
  }, []);

  const companies = cohortData.companies as PrototypeCompany[];
  const benchmarks = cohortData.benchmarks as Record<string, PriceObservation[]>;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return companies.filter((company) => {
      const stageMatches = filter === "All" || company.lifecycle === filter;
      const status = qualificationStatus(company);
      const viewMatches = trackerView === "all" || status === "qualified" || status === "qualified_with_caution";
      const queryMatches =
        !normalized ||
        company.symbol.toLowerCase().includes(normalized) ||
        company.name.toLowerCase().includes(normalized);
      return stageMatches && viewMatches && queryMatches;
    });
  }, [companies, filter, query, trackerView]);

  const selected =
    companies.find((company) => company.symbol === selectedSymbol) || companies[5];
  const chart = useMemo(
    () => genuineSeries(selected, cohortData, benchmarks),
    [selected, cohortData, benchmarks],
  );
  const chartData = chart.points;
  const hasForwardObservation = chart.observedForwardSessions > 0;
  const freezePoint = chartData.find((point) => point.session === 0);
  const forwardPoints = chartData.filter((point) => point.session > 0 && point.company !== null);
  const forwardEnd = forwardPoints.at(-1);
  const companyReturn = hasForwardObservation && forwardEnd && freezePoint
    ? ((forwardEnd.company || 100) / (freezePoint.company || 100)) - 1
    : null;
  const niftyReturn = hasForwardObservation && forwardEnd && freezePoint
    ? ((forwardEnd.nifty || 100) / (freezePoint.nifty || 100)) - 1
    : null;
  const relativeReturn = companyReturn !== null && niftyReturn !== null ? companyReturn - niftyReturn : null;
  const reconstructedReturn = freezePoint?.company !== null && freezePoint?.company !== undefined
    ? (freezePoint.company / 100) - 1
    : null;
  const reconstructedNiftyReturn = freezePoint?.nifty !== null && freezePoint?.nifty !== undefined
    ? (freezePoint.nifty / 100) - 1
    : null;
  const reconstructedRelative = reconstructedReturn !== null && reconstructedNiftyReturn !== null
    ? reconstructedReturn - reconstructedNiftyReturn
    : null;
  const activeYAxisId = priceMode === "indexed" ? "indexed" : "company";

  const chooseLifecycle = (stage: "All" | Lifecycle) => {
    setFilter(stage);
    setQuery("");
    const first = stage === "All" ? companies[0] : companies.find((company) => company.lifecycle === stage);
    if (first) setSelectedSymbol(first.symbol);
  };

  const chooseTrackerView = (view: TrackerView) => {
    setTrackerView(view);
    setQuery("");
    const first = companies.find((company) => {
      const stageMatches = filter === "All" || company.lifecycle === filter;
      const status = qualificationStatus(company);
      return stageMatches && (view === "all" || status === "qualified" || status === "qualified_with_caution");
    });
    if (first) setSelectedSymbol(first.symbol);
  };

  const selectedQualification = qualificationStatus(selected);
  const selectedQualificationCopy = qualificationCopy[selectedQualification];
  const selectedReasons = [
    ...(selected.qualificationReasons ?? []),
    ...(selected.qualityGateReasons ?? []),
  ].filter((reason, index, reasons) => reason && reasons.indexOf(reason) === index);

  if (evidenceOpen) {
    return (
      <SignalEvidenceLayer
        company={selected}
        lifecycleAsOf={cohortData.signalDate}
        onClose={() => setEvidenceOpen(false)}
      />
    );
  }

  return (
    <main className="min-h-screen bg-app-bg pt-24 pb-16 px-4 md:px-6 text-zinc-100">
      <div className="max-w-7xl mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400 hover:text-white transition-colors mb-7"
        >
          <ArrowLeft className="w-4 h-4" /> Back to BMS Discovery
        </button>

        <section className="rounded-[28px] border border-amber-400/20 bg-gradient-to-br from-[#0d1728] via-[#101a2b] to-[#0b1321] overflow-hidden shadow-2xl">
          <div className="px-5 py-6 md:px-8 md:py-8 border-b border-white/10">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-teal-300 mb-3">
                  <Activity className="w-4 h-4" /> Cohort {cohortData.cohortId} · frozen BMS records
                </div>
                <h1 className="text-3xl md:text-5xl font-display font-semibold tracking-tight text-white">
                  BMS Signal Tracker
                </h1>
                <p className="mt-3 text-sm md:text-base text-zinc-400 max-w-3xl leading-relaxed">
                  A prospective validation view that records what happens after a frozen signal. It does not forecast or draw future prices.
                </p>
              </div>
              <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-xs text-amber-200 max-w-sm">
                <strong className="block text-amber-100 mb-1">Two-date study · not a prediction</strong>
                Since-results performance is reconstructed context. Prospective validation begins after the 25 August freeze.
                <span className="block mt-2 text-[10px] uppercase tracking-[0.12em] text-amber-300/80">
                  {dataSource === "cloud" ? "Live cloud record" : "Frozen safety copy"}
                </span>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 mt-7">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4">
                <div className="flex items-center gap-2 text-zinc-500 text-[10px] uppercase tracking-[0.15em] font-black"><FileCheck2 className="w-4 h-4" /> Display cohort</div>
                <div className="mt-2 text-xl font-semibold text-white">25 companies</div>
                <div className="mt-1 text-xs text-zinc-500">5 from each lifecycle</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4">
                <div className="flex items-center gap-2 text-zinc-500 text-[10px] uppercase tracking-[0.15em] font-black"><Clock3 className="w-4 h-4" /> Forward status</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {cohortData.forwardSessionsObserved === 0 ? "Awaiting session 1" : `${cohortData.forwardSessionsObserved} session${cohortData.forwardSessionsObserved === 1 ? "" : "s"} recorded`}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {cohortData.marketEntryDate ? `Tracking from ${formatDate(cohortData.marketEntryDate)}` : `Frozen ${formatDate(cohortData.signalDate)}`}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4">
                <div className="flex items-center gap-2 text-zinc-500 text-[10px] uppercase tracking-[0.15em] font-black"><ShieldCheck className="w-4 h-4" /> Source universe</div>
                <div className="mt-2 text-xl font-semibold text-white">477 recorded</div>
                <div className="mt-1 text-xs text-zinc-500">Complete validation universe</div>
              </div>
            </div>
          </div>

          <div className="px-5 md:px-8 border-b border-white/10 overflow-x-auto">
            <div className="flex min-w-max">
              {([
                { id: "overview", label: "Tracker", enabled: true },
                { id: "explanation", label: "How to read BMS", enabled: true },
                { id: "methodology", label: "Validation methodology", enabled: true },
                { id: "fundamentals", label: "Fundamental outcomes", enabled: false },
                { id: "all", label: "All companies", enabled: false },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => tab.enabled && setActiveSection(tab.id as TrackerSection)}
                  className={`px-4 py-4 text-[10px] uppercase tracking-[0.15em] font-black border-b-2 transition-colors ${activeSection === tab.id ? "border-teal-300 text-white" : tab.enabled ? "border-transparent text-zinc-400 hover:text-white" : "border-transparent text-zinc-600"}`}
                  aria-current={activeSection === tab.id ? "page" : undefined}
                  disabled={!tab.enabled}
                  title={tab.enabled ? tab.label : "Included in a later validation phase"}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className={`${activeSection === "overview" ? "grid" : "hidden"} lg:grid-cols-[390px_minmax(0,1fr)]`}>
            <aside className="border-b lg:border-b-0 lg:border-r border-white/10">
              <div className="p-5 border-b border-white/10">
                <div className="mb-4">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Tracker view</div>
                  <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1" aria-label="Signal qualification view">
                    <button
                      type="button"
                      onClick={() => chooseTrackerView("all")}
                      className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-[0.09em] transition-colors ${trackerView === "all" ? "bg-teal-300 text-slate-950" : "text-zinc-400 hover:text-white"}`}
                    >
                      All signals
                    </button>
                    <button
                      type="button"
                      onClick={() => chooseTrackerView("qualified")}
                      className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-[0.09em] transition-colors ${trackerView === "qualified" ? "bg-teal-300 text-slate-950" : "text-zinc-400 hover:text-white"}`}
                    >
                      Research-ready shortlist
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                    This shortlist contains signals with enough supporting evidence for deeper research. It never removes or rewrites an original BMS signal.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {lifecycleOrder.map((stage) => (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => chooseLifecycle(stage)}
                      className={`px-3 py-2 rounded-full border text-[10px] uppercase tracking-[0.1em] font-black transition-all ${filter === stage ? "border-amber-300 bg-amber-300 text-black" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white hover:border-white/20"}`}
                    >
                      {stage}
                    </button>
                  ))}
                </div>
                <label className="relative block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search company or symbol"
                    className="w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-3 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-teal-400/50"
                  />
                </label>
              </div>

              <div className="p-2 max-h-[560px] overflow-y-auto">
                {filtered.length ? filtered.map((company) => (
                  <button
                    key={company.symbol}
                    type="button"
                    onClick={() => setSelectedSymbol(company.symbol)}
                    className={`w-full text-left rounded-xl px-3 py-3 border transition-all mb-1 ${selected.symbol === company.symbol ? "border-teal-400/30 bg-teal-400/[0.08]" : "border-transparent hover:bg-white/[0.035]"}`}
                  >
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{company.name}</div>
                        <div className="text-[10px] text-zinc-500 mt-1 font-mono">#{company.marketCapRankWithinLifecycle} · {company.symbol} · {formatMarketCap(company.marketCap)}</div>
                        <span className={`inline-flex mt-2 px-2 py-1 rounded-full border text-[8px] uppercase tracking-wider font-black ${qualificationCopy[qualificationStatus(company)].style}`}>
                          {qualificationCopy[qualificationStatus(company)].label}
                        </span>
                      </div>
                      <span className={`h-fit shrink-0 px-2 py-1 rounded-full border text-[9px] uppercase tracking-wider font-black ${lifecycleStyle[company.lifecycle]}`}>
                        {company.lifecycle}
                      </span>
                    </div>
                  </button>
                )) : (
                  <div className="px-4 py-10 text-center text-sm text-zinc-500">
                    {trackerView === "qualified"
                      ? "No company currently has enough supporting evidence to enter the research-ready shortlist. All original signals remain available in All signals."
                      : "No matching prototype company."}
                  </div>
                )}
              </div>
            </aside>

            <section className="p-5 md:p-7 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500">{selected.symbol} · Frozen period {selected.period}</div>
                  <h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">{selected.name}</h2>
                  <div className={`inline-flex mt-3 px-3 py-1.5 rounded-full border text-[10px] uppercase tracking-[0.13em] font-black ${lifecycleStyle[selected.lifecycle]}`}>
                    Frozen signal: {selected.lifecycle}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">#{selected.marketCapRankWithinLifecycle} by market cap within {selected.lifecycle} · {formatMarketCap(selected.marketCap)}</div>
                  <div className="mt-2 text-xs text-zinc-400">
                    Matching {selected.period} result: {formatDate(selected.resultDate)} · BMS recorded: {formatDate(cohortData.signalDate)}
                  </div>
                  <a href={selected.resultDateSourceUrl} target="_blank" rel="noreferrer" className="inline-flex mt-1 text-[10px] uppercase tracking-wider text-sky-300 hover:text-sky-200">
                    Official result-date source ↗
                  </a>
                </div>
                <div className="sm:text-right">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Display score</div>
                  <div className="text-3xl font-mono font-bold text-white mt-1">{score100(selected.rawBms)}</div>
                  <div className="text-xs text-zinc-500">Change {selected.bmsChange >= 0 ? "+" : ""}{selected.bmsChange.toFixed(4)}</div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4 md:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Research readiness · separate from BMS V1</div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <span className={`inline-flex rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${selectedQualificationCopy.style}`}>{selectedQualificationCopy.label}</span>
                      <span className="text-xs text-zinc-500">
                        Delivery {selected.measurableDeliveryDirection ? deliveryDirectionLabel[selected.measurableDeliveryDirection].toLowerCase() : "not yet assessed"}
                        {selected.qualityGatesObserved !== undefined ? ` · ${selected.qualityGatesObserved}${selected.qualityGatesTotal ? `/${selected.qualityGatesTotal}` : ""} quality checks completed` : ""}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-xs text-zinc-500">
                      {selectedReasons[0] || "Open the signal explanation to see how the score was built, compare later results, review business quality, and inspect sources."}
                    </p>
                  </div>
                  <button type="button" onClick={() => setEvidenceOpen(true)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-teal-400/30 bg-teal-400/10 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-teal-200 transition-colors hover:bg-teal-400/15">
                    <FileCheck2 className="h-4 w-4" /> View signal explanation
                  </button>
                </div>
              </div>

              <div className="mt-7 rounded-2xl border border-white/10 bg-black/15 p-4 md:p-5">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-white"><BarChart3 className="w-4 h-4 text-teal-300" /> Historical context and prospective observation</div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {priceMode === "indexed"
                        ? "Indexed performance · starting value = 100 on the first session after the matching result"
                        : "Actual closing values · company price uses the left axis; benchmark levels use the right axis"}
                      {" · future sessions remain blank"}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-1" aria-label="Chart value display">
                      <button
                        type="button"
                        onClick={() => setPriceMode("indexed")}
                        className={`rounded-md px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${priceMode === "indexed" ? "bg-teal-300 text-slate-950" : "text-zinc-400 hover:text-white"}`}
                      >
                        Indexed (100)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPriceMode("actual")}
                        className={`rounded-md px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${priceMode === "actual" ? "bg-teal-300 text-slate-950" : "text-zinc-400 hover:text-white"}`}
                      >
                        Actual price
                      </button>
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-teal-300">Genuine recorded prices</div>
                  </div>
                </div>
                <div className="h-[300px] min-w-0">
                  <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 300 }}>
                    <LineChart data={chartData} margin={{ top: 10, right: priceMode === "actual" ? 12 : 10, left: -15, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis dataKey="session" type="number" domain={[chart.resultMarkerSession, 60]} ticks={[chart.resultMarkerSession, Math.round(chart.resultMarkerSession / 2), 0, 20, 40, 60]} tickFormatter={(value) => value === chart.resultMarkerSession ? "Result" : value === 0 ? "Freeze" : `${value > 0 ? "+" : ""}${value}`} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                      {priceMode === "indexed" ? (
                        <YAxis yAxisId="indexed" domain={["dataMin - 2", "dataMax + 2"]} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                      ) : (
                        <>
                          <YAxis yAxisId="company" domain={["auto", "auto"]} tickFormatter={(value) => `₹${formatPrice(value)}`} tick={{ fill: "#60a5fa", fontSize: 10 }} axisLine={false} tickLine={false} width={68} />
                          <YAxis yAxisId="benchmark" orientation="right" domain={["auto", "auto"]} tickFormatter={(value) => formatPrice(value)} tick={{ fill: "#2dd4bf", fontSize: 10 }} axisLine={false} tickLine={false} width={66} />
                        </>
                      )}
                      <Tooltip
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.date ? formatDate(payload[0].payload.date) : "Not yet observed"}
                        formatter={(value, name, item) => {
                          const point = item.payload as ChartPoint;
                          if (priceMode === "actual") {
                            return [name === selected.symbol ? `₹${formatPrice(Number(value))}` : formatPrice(Number(value)), name];
                          }
                          const actualKey = item.dataKey === "company" ? "actualCompany" : item.dataKey === "nifty" ? "actualNifty" : "actualSector";
                          const actualValue = point[actualKey];
                          const actualLabel = item.dataKey === "company" ? `Close ₹${formatPrice(actualValue || 0)}` : `Level ${formatPrice(actualValue || 0)}`;
                          return [`Index ${formatPrice(Number(value))} · ${actualLabel}`, name];
                        }}
                        contentStyle={{ background: "#111827", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }}
                        labelStyle={{ color: "#a1a1aa" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
                      <ReferenceArea yAxisId={activeYAxisId} x1={chart.resultMarkerSession} x2={0} fill="rgba(167,139,250,0.07)" ifOverflow="extendDomain" />
                      <ReferenceArea yAxisId={activeYAxisId} x1={chart.observedForwardSessions} x2={60} fill="rgba(113,113,122,0.10)" ifOverflow="extendDomain" />
                      <ReferenceLine yAxisId={activeYAxisId} x={chart.resultMarkerSession} stroke="#60a5fa" strokeDasharray="4 4" label={{ value: "Matching result · reconstructed", position: "insideTopRight", fill: "#60a5fa", fontSize: 10 }} />
                      <ReferenceLine yAxisId={activeYAxisId} x={0} stroke="#a78bfa" strokeDasharray="4 4" label={{ value: chart.observedForwardSessions ? "Prospective freeze" : "Prospective freeze · current as-of date", position: "insideTopRight", fill: "#a78bfa", fontSize: 10 }} />
                      {chart.observedForwardSessions > 0 && (
                        <ReferenceLine yAxisId={activeYAxisId} x={chart.observedForwardSessions} stroke="#fbbf24" strokeDasharray="4 4" label={{ value: `As of +${chart.observedForwardSessions}`, position: "insideTopLeft", fill: "#fbbf24", fontSize: 10 }} />
                      )}
                      <ReferenceLine yAxisId={activeYAxisId} x={20} stroke="rgba(255,255,255,0.16)" strokeDasharray="2 4" />
                      <ReferenceLine yAxisId={activeYAxisId} x={60} stroke="rgba(255,255,255,0.16)" strokeDasharray="2 4" />
                      {priceMode === "indexed" ? (
                        <>
                          <Line yAxisId="indexed" type="monotone" dataKey="company" name={selected.symbol} stroke="#60a5fa" strokeWidth={2.5} dot={false} />
                          <Line yAxisId="indexed" type="monotone" dataKey="nifty" name="Nifty 50" stroke="#2dd4bf" strokeWidth={2} dot={false} />
                          <Line yAxisId="indexed" type="monotone" dataKey="sector" name={selected.sectorBenchmarkLabel} stroke="#f59e0b" strokeWidth={2} dot={false} />
                        </>
                      ) : (
                        <>
                          <Line yAxisId="company" type="monotone" dataKey="actualCompany" name={selected.symbol} stroke="#60a5fa" strokeWidth={2.5} dot={false} />
                          <Line yAxisId="benchmark" type="monotone" dataKey="actualNifty" name="Nifty 50" stroke="#2dd4bf" strokeWidth={2} dot={false} />
                          <Line yAxisId="benchmark" type="monotone" dataKey="actualSector" name={selected.sectorBenchmarkLabel} stroke="#f59e0b" strokeWidth={2} dot={false} />
                        </>
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-xs leading-relaxed text-zinc-400">
                <span className="font-semibold text-white">How to read these figures:</span> the first two describe the period before tracking began. The last two are the live forward record after the signal was frozen. “Versus Nifty 50” means the stock return minus the Nifty 50 return over the same dates.
              </div>

              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
                <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.035] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-sky-300">Before tracking · stock return</div>
                  <div className={`text-lg font-mono font-bold mt-1 ${reconstructedReturn === null ? "text-zinc-400" : reconstructedReturn >= 0 ? "text-emerald-300" : "text-red-300"}`}>{reconstructedReturn === null ? "Unavailable" : percentage(reconstructedReturn)}</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">Price change from the matching result to the {formatDate(cohortData.signalDate)} freeze.</div>
                  <div className="mt-2 text-[9px] text-sky-300 uppercase tracking-wider">Historical context · reconstructed later</div>
                </div>
                <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.035] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-sky-300">Before tracking · versus Nifty 50</div>
                  <div className={`text-lg font-mono font-bold mt-1 ${reconstructedRelative === null ? "text-zinc-400" : reconstructedRelative >= 0 ? "text-emerald-300" : "text-red-300"}`}>{reconstructedRelative === null ? "Unavailable" : percentagePoints(reconstructedRelative)}</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">Stock return minus Nifty 50 return over that period.</div>
                  <div className="mt-2 text-[9px] text-sky-300 uppercase tracking-wider">Historical context · reconstructed later</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-amber-200">After freeze · stock return</div>
                  <div className={`text-lg font-mono font-bold mt-1 ${companyReturn === null ? "text-zinc-400" : companyReturn >= 0 ? "text-emerald-300" : "text-red-300"}`}>{companyReturn === null ? "Awaiting data" : percentage(companyReturn)}</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">Price change from the {formatDate(cohortData.signalDate)} freeze to the latest recorded date.</div>
                  <div className="mt-2 text-[9px] text-amber-200 uppercase tracking-wider">Live forward-validation record</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-amber-200">After freeze · versus Nifty 50</div>
                  <div className={`text-lg font-mono font-bold mt-1 ${relativeReturn === null ? "text-zinc-400" : relativeReturn >= 0 ? "text-emerald-300" : "text-red-300"}`}>{relativeReturn === null ? "Awaiting data" : percentagePoints(relativeReturn)}</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">Stock return minus Nifty 50 return after the freeze.</div>
                  <div className="mt-2 text-[9px] text-amber-200 uppercase tracking-wider">Live forward-validation record</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                <span>As of {formatDate(cohortData.asOfDate)} · {cohortData.forwardSessionsObserved === 0 ? "forward window has not begun" : `${cohortData.forwardSessionsObserved} forward market session${cohortData.forwardSessionsObserved === 1 ? "" : "s"} recorded`}</span>
                <span>Sessions {cohortData.forwardSessionsObserved + 1}–60: not yet observed · no projection</span>
              </div>

              <div className="mt-3 rounded-xl border border-sky-400/15 bg-sky-400/[0.035] px-4 py-3 text-xs text-zinc-400 leading-relaxed">
                The result-to-freeze interval is a point-in-time reconstruction using the matching {selected.period} result date; it is not claimed as a signal recorded on that historical date. Because this display cohort was selected by market cap on 25 August, the reconstructed interval is descriptive context—not an unbiased cohort backtest. The prospective record begins only after {formatDate(cohortData.signalDate)}.
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-teal-300 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">What this frozen signal means</h3>
                    <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{lifecycleMeaning[selected.lifecycle]}</p>
                    <p className="text-xs text-zinc-500 mt-3">Evidence: {selected.evidenceStrength} · {selected.evidenceCount} observations. BMS is a research-prioritisation signal, not a buy, sell or hold recommendation.</p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {activeSection === "explanation" && (
            <section className="px-5 py-7 md:px-8 md:py-9">
              <div className="max-w-5xl">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-teal-300">
                  <BookOpenCheck className="w-4 h-4" /> Plain-language guide
                </div>
                <h2 className="mt-3 text-2xl md:text-4xl font-semibold text-white">How to read a BMS signal</h2>
                <p className="mt-3 max-w-3xl text-sm md:text-base leading-relaxed text-zinc-400">
                  BMS organises evidence about changes in business fundamentals. It helps a user decide where deeper research may be worthwhile; it does not predict a share price or issue a buy, sell or hold instruction.
                </p>
              </div>

              <div className="mt-7 grid lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-teal-400/20 bg-teal-400/[0.045] p-5 md:p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-teal-400/10 p-2.5"><Gauge className="w-5 h-5 text-teal-300" /></div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.15em] text-teal-300">System responsibility</div>
                      <h3 className="mt-1 text-lg font-semibold text-white">What BMS does</h3>
                    </div>
                  </div>
                  <div className="mt-5 space-y-4">
                    {[
                      { icon: Database, title: "Watches", text: "Records changes in company fundamentals, factor scores, change points and supporting evidence." },
                      { icon: Gauge, title: "Scores and classifies", text: "Applies the same deterministic calculation and places each company in one of five lifecycle stages." },
                      { icon: Workflow, title: "Explains", text: "Surfaces the evidence drivers behind the stage so the change can be examined rather than accepted as a black box." },
                      { icon: LockKeyhole, title: "Freezes and tracks", text: "Preserves the dated signal and records subsequent price movement without rewriting the original classification." },
                    ].map((item) => (
                      <div key={item.title} className="flex gap-3">
                        <item.icon className="mt-0.5 w-4 h-4 shrink-0 text-teal-300" />
                        <div><div className="text-sm font-semibold text-white">{item.title}</div><p className="mt-1 text-xs leading-relaxed text-zinc-400">{item.text}</p></div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.045] p-5 md:p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-sky-400/10 p-2.5"><UserRoundCheck className="w-5 h-5 text-sky-300" /></div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.15em] text-sky-300">User responsibility</div>
                      <h3 className="mt-1 text-lg font-semibold text-white">What the user does</h3>
                    </div>
                  </div>
                  <div className="mt-5 space-y-4">
                    {[
                      { icon: SearchCheck, title: "Selects a research priority", text: "Uses the lifecycle stage to decide which company deserves attention—not which security to buy or sell." },
                      { icon: BookOpenCheck, title: "Reads the evidence", text: "Examines why the score changed and checks the underlying filings, results and authoritative sources." },
                      { icon: TriangleAlert, title: "Tests the complete thesis", text: "Assesses sustainability, valuation, expectations, risks and contrary evidence beyond the BMS signal." },
                      { icon: UserRoundCheck, title: "Decides independently", text: "Makes and monitors any investment decision independently, with professional advice where appropriate." },
                    ].map((item) => (
                      <div key={item.title} className="flex gap-3">
                        <item.icon className="mt-0.5 w-4 h-4 shrink-0 text-sky-300" />
                        <div><div className="text-sm font-semibold text-white">{item.title}</div><p className="mt-1 text-xs leading-relaxed text-zinc-400">{item.text}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="text-sm font-semibold text-white">The five lifecycle stages</h3>
                <p className="mt-1 text-xs text-zinc-500">Every stage is a research state—not an expected return category.</p>
                <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
                  {lifecycleStages.map((stage) => (
                    <div key={stage} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${lifecycleStyle[stage]}`}>{stage}</span>
                      <p className="mt-3 text-xs leading-relaxed text-zinc-400">{lifecycleMeaning[stage]}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 grid md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><CheckCircle2 className="w-5 h-5" /> Appropriate interpretation</div>
                  <ul className="mt-4 space-y-2 text-sm text-zinc-400">
                    <li>• “This company deserves further investigation.”</li>
                    <li>• “The business evidence appears to be changing.”</li>
                    <li>• “I should test durability, valuation and risks.”</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-orange-400/20 bg-orange-400/[0.05] p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-orange-200"><TriangleAlert className="w-5 h-5" /> Inappropriate interpretation</div>
                  <ul className="mt-4 space-y-2 text-sm text-zinc-400">
                    <li>• “Emerging means the price will rise.”</li>
                    <li>• “Fading means I must sell.”</li>
                    <li>• “The tracker proves that BMS predicts returns.”</li>
                  </ul>
                </div>
              </div>
            </section>
          )}

          {activeSection === "methodology" && (
            <section className="px-5 py-7 md:px-8 md:py-9">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">
                    <LockKeyhole className="w-4 h-4" /> Frozen prospective protocol
                  </div>
                  <h2 className="mt-3 text-2xl md:text-4xl font-semibold text-white">Validation methodology</h2>
                  <p className="mt-3 text-sm md:text-base leading-relaxed text-zinc-400">
                    The study separates reconstructed historical context from genuine forward observation. Signals, lifecycle labels and cohort membership are frozen before forward outcomes are recorded.
                  </p>
                </div>
                <div className="rounded-2xl border border-teal-400/20 bg-teal-400/[0.05] px-5 py-4 min-w-[260px]">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Current prospective status</div>
                  <div className="mt-2 text-lg font-semibold text-white">{cohortData.forwardSessionsObserved} session{cohortData.forwardSessionsObserved === 1 ? "" : "s"} recorded</div>
                  <div className="mt-1 text-xs text-teal-300">As of {formatDate(cohortData.asOfDate)}</div>
                </div>
              </div>

              <div className="mt-8 grid lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.04] p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-sky-200"><CalendarClock className="w-5 h-5" /> Date 1 · Matching result</div>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                    The official release date for the same quarter as the frozen BMS score. Prices from the first following trading session to the freeze are shown only as reconstructed company context.
                  </p>
                  <div className="mt-3 text-[10px] uppercase tracking-[0.12em] text-sky-300">Not claimed as a historically published signal</div>
                </div>
                <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.04] p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-violet-200"><LockKeyhole className="w-5 h-5" /> Date 2 · Prospective freeze</div>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                    On {formatDate(cohortData.signalDate)}, the 477-company universe, displayed 25, BMS values and lifecycle stages were recorded. Only sessions strictly after this date count as forward validation.
                  </p>
                  <div className="mt-3 text-[10px] uppercase tracking-[0.12em] text-violet-300">Genuine prospective observation begins here</div>
                </div>
              </div>

              <div className="mt-7 rounded-2xl border border-white/10 overflow-hidden">
                {[
                  ["Cohort", "477 frozen companies; the display tracker shows the five highest market-cap companies in each lifecycle as recorded on the freeze date."],
                  ["Benchmarks", "Each company is compared with Nifty 50 and a predeclared secondary index. Benchmark assignments are not changed after observing returns."],
                  ["Indexed chart", "Adjusted closes are rebased to 100 for visual comparability. The Actual price control shows genuine closing values on separate axes."],
                  ["Forward metrics", "Company return, Nifty return and company-minus-Nifty relative return are calculated from the freeze close to the latest observed close."],
                  ["Missing data", "Future sessions remain blank. Missing or partial downloads are never filled, projected or silently accepted."],
                  ["Study horizon", "The first formal reading is planned after one quarter. Shorter windows are operational observations, not evidence of efficacy."],
                ].map(([label, value], index) => (
                  <div key={label} className={`grid md:grid-cols-[180px_1fr] gap-2 px-5 py-4 ${index ? "border-t border-white/10" : ""}`}>
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">{label}</div>
                    <div className="text-sm leading-relaxed text-zinc-400">{value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-7 grid md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                  <Database className="w-5 h-5 text-teal-300" />
                  <h3 className="mt-3 text-sm font-semibold text-white">Daily data operation</h3>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">Scheduled design: 19:30 IST after market data publication. Repeated runs are idempotent and duplicate dates are removed.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                  <ShieldCheck className="w-5 h-5 text-teal-300" />
                  <h3 className="mt-3 text-sm font-semibold text-white">Quality protection</h3>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">Frozen-file hashes, single-run locking, minimum coverage checks and rollback protect the record from partial updates.</p>
                </div>
                <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.035] p-5">
                  <TriangleAlert className="w-5 h-5 text-amber-300" />
                  <h3 className="mt-3 text-sm font-semibold text-white">Prototype limitation</h3>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">Company prices use Yahoo Finance provisionally; benchmark closes use official Nifty Indices history. Public deployment still requires appropriate data licensing.</p>
                </div>
              </div>

              <div className="mt-7 rounded-2xl border border-orange-400/20 bg-orange-400/[0.045] px-5 py-4 text-sm leading-relaxed text-zinc-400">
                <strong className="text-orange-200">Interpretation boundary:</strong> this tracker measures what happened after a frozen research signal. It does not prove causality, promise outperformance or convert any lifecycle stage into investment advice.
              </div>
            </section>
          )}

          <footer className="px-5 md:px-8 py-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            <span>Frozen 477-company BMS file · company prices: Yahoo prototype · benchmarks: Nifty Indices · not investment advice</span>
            <button type="button" disabled className="inline-flex items-center gap-2 text-zinc-600"><Download className="w-4 h-4" /> Cohort download in full build</button>
          </footer>
        </section>
      </div>
    </main>
  );
}
