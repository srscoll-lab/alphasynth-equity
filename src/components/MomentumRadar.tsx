import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, CheckCircle2, Clock3, Compass, RefreshCw, Search, ShieldAlert, TrendingUp, X } from "lucide-react";
import radarData from "../data/bmsMomentumRadar.json";
import expandedRadarData from "../data/bmsMomentumRadarExpanded.json";
import lifecycleV21 from "../data/momentumExpansionLifecycleV21.json";
import expansionStudies from "../data/momentumExpansionStudies.json";
import { fundamentalChangeLibrary } from "../data/fundamentalChangeLibrary";
import {
  defaultFundamentalReviewMessage,
  isFundamentalReviewInProgress,
  normalizeFundamentalReviewJob,
  type FundamentalReviewJob,
} from "../fundamental-review-contract";

type RadarState = "DORMANT" | "STARTING" | "CONFIRMED" | "EXTENDED" | "DETERIORATING" | "INSUFFICIENT_HISTORY";
type Segment = "LARGE_CAP" | "MID_CAP" | "SMALL_CAP" | "MICRO_CAP" | "EXTENDED_NSE" | "UNCLASSIFIED";
type DirectionView = "positive" | "negative" | "neutral";
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
const stateLabel: Record<RadarState, string> = {
  DORMANT: "No Directional Setup",
  STARTING: "Early Uptrend",
  CONFIRMED: "Established Uptrend",
  EXTENDED: "Stretched Uptrend",
  DETERIORATING: "Negative Direction",
  INSUFFICIENT_HISTORY: "Insufficient History",
};
const stateMeaning: Record<RadarState, string> = {
  DORMANT: "Evidence is mixed, so no directional setup is identified.",
  STARTING: "Preliminary positive conditions are present.",
  CONFIRMED: "Several independent trend conditions agree.",
  EXTENDED: "The trend remains positive, but price is unusually far above its recent average.",
  DETERIORATING: "Trend or relative strength has weakened.",
  INSUFFICIENT_HISTORY: "Fewer than 252 sessions are available, so no cross-sectional rank is published.",
};
const pct = (value: number | null) => value === null ? "Unavailable" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
const money = (value: number | null) => value === null ? "Unavailable" : `₹${new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
const ratio = (value: number | null) => value === null ? "Unavailable" : `${value.toFixed(2)}×`;
const segmentLabel = (segment: string) => segment.replaceAll("EXTENDED_NSE", "Broader NSE").replaceAll("Extended NSE", "Broader NSE").replaceAll("_", " ");

type DownsidePhase = "EARLY_DOWNTREND" | "ESTABLISHED_DOWNTREND" | "STRETCHED_DOWNTREND";
const downsidePhaseLabel: Record<DownsidePhase, string> = {
  EARLY_DOWNTREND: "Early Downtrend",
  ESTABLISHED_DOWNTREND: "Established Downtrend",
  STRETCHED_DOWNTREND: "Stretched Downtrend",
};
const downsideAssessment = (company: Company) => {
  if (company.radar_state !== "DETERIORATING") return null;
  const fullAgreement = company.adjusted_close < company.sma_50
    && company.sma_50 < company.sma_200
    && company.momentum_6_1 < 0
    && company.relative_strength < 0;
  const dailyVolatility = company.annualized_volatility_63 / Math.sqrt(252);
  const stretchThreshold = Math.max(0.12, 2.5 * dailyVolatility * Math.sqrt(20));
  const phase: DownsidePhase = fullAgreement && company.distance_from_sma50 <= -stretchThreshold
    ? "STRETCHED_DOWNTREND"
    : fullAgreement
      ? "ESTABLISHED_DOWNTREND"
      : "EARLY_DOWNTREND";
  const downsidePressureScore = company.experimental_rank_score === null ? null : Number((100 - company.experimental_rank_score).toFixed(2));
  const potentiallyOversold = phase === "STRETCHED_DOWNTREND";
  const recoveryConfirmed = company.adjusted_close > company.sma_50
    && company.momentum_20d > 0
    && company.momentum_5d > 0
    && company.relative_strength > 0;
  return { phase, downsidePressureScore, potentiallyOversold, recoveryConfirmed };
};
const directionalStateLabel = (company: Company) => {
  const downside = downsideAssessment(company);
  return downside ? downsidePhaseLabel[downside.phase] : stateLabel[company.radar_state as RadarState];
};
const triggerSummary = (trigger: Company["current_momentum_trigger"]) => {
  if (!trigger) return { label: "Unavailable", style: "text-zinc-500" };
  if (trigger.breakout_status === "CONFIRMED" && trigger.momentum_20d > 0 && trigger.momentum_5d > 0) return { label: "Confirmed", style: "text-emerald-300" };
  if (trigger.momentum_20d > 0 && trigger.momentum_5d > 0 && trigger.traded_value_acceleration_5_vs_prior_20 >= 1.1) return { label: "Accelerating", style: "text-cyan-300" };
  if (trigger.momentum_20d > 0 && trigger.momentum_5d >= 0) return { label: "Developing", style: "text-sky-300" };
  if (trigger.momentum_20d > 0 && trigger.momentum_5d < 0) return { label: "Cooling", style: "text-amber-200" };
  if (trigger.momentum_20d < 0 && trigger.momentum_5d < 0) return { label: "Reversing", style: "text-rose-300" };
  return { label: "Mixed", style: "text-zinc-300" };
};
const breakoutLabel = (status: Company["current_momentum_trigger"] extends infer T ? T extends { breakout_status: infer S } ? S : never : never) => ({
  CONFIRMED: "Confirmed",
  PRICE_ONLY: "Price only",
  NEAR_BREAKOUT: "Near breakout",
  NOT_CONFIRMED: "Not confirmed",
}[status] ?? "Unavailable");
const momentumPriorityStatus = (company: Company) => {
  if (company.selection_gate.eligible) {
    return {
      label: "Prioritised by Momentum Radar",
      reason: "The current trend, liquidity, history and data-quality rules make this a higher research priority. This is not an FCS conclusion.",
      style: "text-emerald-300",
    };
  }

  const reasons = company.selection_gate.exclusion_reasons ?? [];
  if (reasons.includes("extension") || company.radar_state === "EXTENDED") {
    return {
      label: "Not prioritised by Momentum Radar",
      reason: "The uptrend is already stretched, so the radar does not prioritise fresh evidence work.",
      style: "text-amber-200",
    };
  }
  if (reasons.includes("liquidity")) {
    return {
      label: "Not prioritised by Momentum Radar",
      reason: "Recent traded value is below the current liquidity requirement.",
      style: "text-zinc-300",
    };
  }
  if (reasons.includes("history")) {
    return {
      label: "Not prioritised by Momentum Radar",
      reason: "There is not yet enough comparable price history.",
      style: "text-zinc-300",
    };
  }
  if (reasons.includes("data_quality")) {
    return {
      label: "Not prioritised by Momentum Radar",
      reason: "The latest market data requires validation or refresh.",
      style: "text-zinc-300",
    };
  }
  return {
    label: "Not prioritised by Momentum Radar",
    reason: "The current momentum setup does not meet the radar's research-priority rules. An optional FCS review may still be requested.",
    style: "text-zinc-300",
  };
};
const lifecycleBySymbol = new Map(lifecycleV21.companies.map((company) => [company.symbol, company]));
const studyBySymbol = new Map(expansionStudies.companies.map((company) => [company.symbol, company]));
const fcsRecordBySymbol = new Map(fundamentalChangeLibrary.map((company) => [company.symbol, company]));

type MomentumDirection = "rising" | "neutral" | "falling" | "unavailable";

const momentumDirection = (state: RadarState): MomentumDirection => {
  if (state === "STARTING" || state === "CONFIRMED" || state === "EXTENDED") return "rising";
  if (state === "DETERIORATING") return "falling";
  if (state === "DORMANT") return "neutral";
  return "unavailable";
};

const directionPresentation: Record<MomentumDirection, { label: string; style: string }> = {
  rising: { label: "Positive price direction", style: "text-emerald-300" },
  neutral: { label: "Neutral price direction", style: "text-zinc-300" },
  falling: { label: "Negative price direction", style: "text-rose-300" },
  unavailable: { label: "Direction unavailable", style: "text-violet-300" },
};

const fundamentalRelationship = (company: Company) => {
  const lifecycle = lifecycleBySymbol.get(company.symbol);
  if (!lifecycle) {
    if (fcsRecordBySymbol.has(company.symbol)) {
      return {
        label: "Relationship awaiting history",
        detail: "FCS is available, but comparable checkpoints are not yet sufficient to establish a fundamental direction.",
        style: "text-cyan-200",
      };
    }
    return {
      label: "Fundamental relationship not evaluated",
      detail: "No convergence or divergence is inferred until an FCS review and comparable history exist.",
      style: "text-zinc-400",
    };
  }

  const scores = lifecycle.score_path;
  const latestChange = scores.at(-1)! - scores.at(-2)!;
  const fcsDirection = latestChange >= 5 ? "improving" : latestChange <= -5 ? "weakening" : "stable";
  const priceDirection = momentumDirection(company.radar_state as RadarState);

  if (priceDirection === "rising" && fcsDirection === "improving") {
    return { label: "Positive convergence", detail: "Rising market momentum is accompanied by a materially improving FCS.", style: "text-emerald-300" };
  }
  if (priceDirection === "falling" && fcsDirection === "weakening") {
    return { label: "Negative convergence", detail: "Falling market momentum is accompanied by a materially weakening FCS.", style: "text-rose-300" };
  }
  if (priceDirection === "rising" && fcsDirection === "weakening") {
    return { label: "Cautionary divergence", detail: "Market momentum is rising while the latest comparable FCS has weakened materially.", style: "text-amber-200" };
  }
  if (priceDirection === "falling" && fcsDirection === "improving") {
    return { label: "Recovery divergence", detail: "The latest comparable FCS has improved while market momentum is falling.", style: "text-sky-300" };
  }
  if (fcsDirection === "stable") {
    return { label: "No material FCS change", detail: "The latest comparable FCS move is inside the five-point materiality band.", style: "text-zinc-300" };
  }
  return { label: "No directional relationship", detail: "Fundamental direction exists, but price momentum is presently neutral or unavailable.", style: "text-zinc-300" };
};
const lifecycleStyle: Record<string, string> = {
  ESTABLISHED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  FADING: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  RECOVERING: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  REBOUNDING: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300",
  BUILDING: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  EMERGING: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  WATCH: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
};

const reviewStatusLabel = (status: FundamentalReviewJob["status"]) => ({
  not_started: "FCS not started",
  queued: "Review queued",
  locating_evidence: "Locating evidence",
  validating_factors: "Validating factors",
  scoring: "Calculating FCS",
  lifecycle_processing: "Lifecycle processing",
  score_ready_lifecycle_pending: "FCS ready · lifecycle pending",
  ready: "FCS & lifecycle ready",
  incomplete: "Review incomplete",
  failed: "Review needs attention",
}[status]);

type MomentumRadarProps = {
  onBack: () => void;
  onBrowseLibrary: (symbol?: string) => void;
  onDeepDive: (company: { symbol: string; company_name: string; bms_status: "ready" | "fcs_ready" | "processing" | "not_requested" }) => void;
};

export default function MomentumRadar({ onBack, onBrowseLibrary, onDeepDive }: MomentumRadarProps) {
  const radarMode = new URLSearchParams(window.location.search).get("radar");
  // The expanded NSE radar is the product default. The frozen 477-company radar
  // remains available only through an explicit `radar=legacy` validation URL.
  const expandedMode = radarMode !== "legacy";
  const [runtimeRadarData, setRuntimeRadarData] = useState<RadarDataset | null>(null);
  const [radarRefreshWarning, setRadarRefreshWarning] = useState("");
  useEffect(() => {
    if (!expandedMode) return;
    let active = true;
    fetch("/api/bms/momentum-radar", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (!active || !Array.isArray(payload?.companies) || !payload.companies.length) return;
        setRuntimeRadarData(payload as RadarDataset);
        setRadarRefreshWarning(typeof payload.refresh_warning === "string" ? payload.refresh_warning : "");
      })
      .catch(() => {
        if (active) setRadarRefreshWarning("The live daily snapshot is unavailable; showing the last bundled verified snapshot.");
      });
    return () => { active = false; };
  }, [expandedMode]);
  const activeRadarData: RadarDataset = expandedMode ? runtimeRadarData ?? expandedRadarData : radarData as unknown as RadarDataset;
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
  const requestedDirection = new URLSearchParams(window.location.search).get("direction");
  const [directionView, setDirectionView] = useState<DirectionView>(requestedDirection === "negative" || requestedDirection === "neutral" ? requestedDirection : "positive");
  const [inactiveFilter, setInactiveFilter] = useState<"ALL" | "DORMANT" | "DETERIORATING">(
    requestedDirection === "negative" ? "DETERIORATING" : requestedDirection === "neutral" ? "DORMANT" : "ALL",
  );
  const [downsidePhaseFilter, setDownsidePhaseFilter] = useState<"ALL" | DownsidePhase | "POTENTIALLY_OVERSOLD">("ALL");
  const [inactiveSegment, setInactiveSegment] = useState<"ALL" | Segment>("ALL");
  const [inactiveQuery, setInactiveQuery] = useState("");
  const [reviewJobs, setReviewJobs] = useState<Record<string, FundamentalReviewJob>>({});
  const [requestCandidate, setRequestCandidate] = useState<Company | null>(null);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [reviewRequestsAvailable, setReviewRequestsAvailable] = useState(false);
  const [reviewRequestMessage, setReviewRequestMessage] = useState("New FCS processing is not yet activated. Existing published reports remain available.");
  const [reviewSupportedSymbols, setReviewSupportedSymbols] = useState<Set<string>>(new Set());
  const [reviewRequestScope, setReviewRequestScope] = useState<"controlled_beta" | "radar_universe">("controlled_beta");
  useEffect(() => {
    let active = true;
    fetch("/api/bms/fundamental-review/capabilities", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!active) return;
        setReviewRequestsAvailable(payload?.available === true);
        setReviewRequestScope(payload?.requestScope === "radar_universe" ? "radar_universe" : "controlled_beta");
        setReviewSupportedSymbols(new Set(Array.isArray(payload?.supportedSymbols) ? payload.supportedSymbols : []));
        if (typeof payload?.scopeMessage === "string" && payload.scopeMessage) setReviewRequestMessage(payload.scopeMessage);
        if (typeof payload?.unavailableReason === "string" && payload.unavailableReason) setReviewRequestMessage(payload.unavailableReason);
      })
      .catch(() => {
        if (!active) return;
        setReviewRequestsAvailable(false);
        setReviewRequestMessage("New FCS processing is temporarily unavailable. Existing published reports remain available.");
      });
    return () => { active = false; };
  }, []);
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
  const selectedRuntimeJob = selectedStatusCompany ? reviewJobs[selectedStatusCompany.symbol] : null;
  const inactiveCounts = {
    all: inactiveMomentumCompanies.length,
    dormant: inactiveMomentumCompanies.filter((company) => company.radar_state === "DORMANT").length,
    deteriorating: inactiveMomentumCompanies.filter((company) => company.radar_state === "DETERIORATING").length,
  };
  const downsideSummary = inactiveMomentumCompanies.reduce((summary, company) => {
    const assessment = downsideAssessment(company);
    if (!assessment) return summary;
    summary[assessment.phase] += 1;
    if (assessment.potentiallyOversold) summary.potentiallyOversold += 1;
    return summary;
  }, { EARLY_DOWNTREND: 0, ESTABLISHED_DOWNTREND: 0, STRETCHED_DOWNTREND: 0, potentiallyOversold: 0 });
  const inactiveSegmentCounts = useMemo(() => {
    const normalized = inactiveQuery.trim().toLowerCase();
    const relevant = inactiveMomentumCompanies.filter((company) => (inactiveFilter === "ALL" || company.radar_state === inactiveFilter)
      && (downsidePhaseFilter === "ALL"
        || (downsidePhaseFilter === "POTENTIALLY_OVERSOLD"
          ? downsideAssessment(company)?.potentiallyOversold === true
          : downsideAssessment(company)?.phase === downsidePhaseFilter))
      && (!normalized || company.symbol.toLowerCase().includes(normalized) || company.company_name.toLowerCase().includes(normalized)));
    return Object.fromEntries(segments.map((item) => [item, item === "ALL" ? relevant.length : relevant.filter((company) => company.market_cap_segment.id === item).length])) as Record<"ALL" | Segment, number>;
  }, [downsidePhaseFilter, inactiveFilter, inactiveMomentumCompanies, inactiveQuery]);
  const filteredInactiveCompanies = inactiveMomentumCompanies.filter((company) => {
    const normalized = inactiveQuery.trim().toLowerCase();
    return (inactiveFilter === "ALL" || company.radar_state === inactiveFilter)
      && (inactiveSegment === "ALL" || company.market_cap_segment.id === inactiveSegment)
      && (downsidePhaseFilter === "ALL"
        || (downsidePhaseFilter === "POTENTIALLY_OVERSOLD"
          ? downsideAssessment(company)?.potentiallyOversold === true
          : downsideAssessment(company)?.phase === downsidePhaseFilter))
      && (!normalized || company.symbol.toLowerCase().includes(normalized) || company.company_name.toLowerCase().includes(normalized));
  });
  const displayedInactiveCompanies = filteredInactiveCompanies.slice(0, 100);
  const latestCheckpoint = selectedStudy?.checkpoints.at(-1);
  const openStudy = (symbol: string) => {
    setSelectedStudySymbol(symbol);
    window.setTimeout(() => document.getElementById("momentum-bms-study")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const selectDirection = (direction: DirectionView) => {
    setDirectionView(direction);
    setInactiveFilter(direction === "negative" ? "DETERIORATING" : direction === "neutral" ? "DORMANT" : "ALL");
    setDownsidePhaseFilter("ALL");
    setInactiveSegment("ALL");
    const url = new URL(window.location.href);
    url.searchParams.set("direction", direction);
    window.history.replaceState({}, "", url);
    window.setTimeout(() => document.getElementById("direction-radar-view")?.scrollIntoView({ behavior: "auto", block: "start" }), 50);
  };

  const showRequestConfirmation = (company: Company) => {
    setRequestError("");
    setRequestCandidate(company);
  };

  const requestFundamentalReview = async () => {
    if (!requestCandidate || requestSubmitting) return;
    setRequestSubmitting(true);
    setRequestError("");
    try {
      const response = await fetch("/api/bms/fundamental-review/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: requestCandidate.symbol, company_name: requestCandidate.company_name }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "The review request could not be started.");
      const job = normalizeFundamentalReviewJob(payload?.job || payload, {
        symbol: requestCandidate.symbol,
        companyName: requestCandidate.company_name,
      });
      if (!job.jobId || (!isFundamentalReviewInProgress(job.status) && !job.resultAvailable)) {
        throw new Error("The review service did not return a valid durable job acknowledgement. No review was started.");
      }
      setReviewJobs((current) => ({ ...current, [job.symbol]: job }));
      setSelectedStatusSymbol(job.symbol);
      setRequestCandidate(null);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The review request could not be started.");
    } finally {
      setRequestSubmitting(false);
    }
  };

  const refreshFundamentalReviewStatus = async () => {
    if (!selectedStatusCompany || refreshingStatus) return;
    setRefreshingStatus(true);
    try {
      const response = await fetch(`/api/bms/fundamental-review/status/${encodeURIComponent(selectedStatusCompany.symbol)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "The latest review status is unavailable.");
      const job = normalizeFundamentalReviewJob(payload?.job || payload, {
        symbol: selectedStatusCompany.symbol,
        companyName: selectedStatusCompany.company_name,
      });
      setReviewJobs((current) => ({ ...current, [job.symbol]: job }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "The latest review status is unavailable.";
      setReviewJobs((current) => ({
        ...current,
        [selectedStatusCompany.symbol]: current[selectedStatusCompany.symbol]
          ? { ...current[selectedStatusCompany.symbol], message }
          : normalizeFundamentalReviewJob({ status: "not_started", message }, { symbol: selectedStatusCompany.symbol, companyName: selectedStatusCompany.company_name }),
      }));
    } finally {
      setRefreshingStatus(false);
    }
  };

  const renderFcsStatus = (company: Company) => lifecycleBySymbol.has(company.symbol) ? <>
    <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${lifecycleStyle[lifecycleBySymbol.get(company.symbol)!.lifecycle_v2_1]}`}>READY · {lifecycleBySymbol.get(company.symbol)!.lifecycle_v2_1}</span>
    <div className="mt-2 text-[10px] leading-relaxed text-zinc-300">{lifecycleBySymbol.get(company.symbol)!.score_path.join(" → ")} · {lifecycleBySymbol.get(company.symbol)!.reason}</div>
    <button type="button" onClick={() => openStudy(company.symbol)} className="mt-2 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-200 hover:text-white"><CheckCircle2 className="h-3.5 w-3.5" /> View FCS &amp; lifecycle</button>
  </> : studyBySymbol.has(company.symbol) ? <>
    <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-100"><CheckCircle2 className="h-3.5 w-3.5" /> FCS ready · lifecycle pending</span>
    <div className="mt-2 text-[9px] leading-relaxed text-zinc-400">The four-factor score is available. Lifecycle requires three comparable checkpoints.</div>
    <button type="button" onClick={() => openStudy(company.symbol)} className="mt-2 block text-[9px] font-black uppercase tracking-[0.08em] text-cyan-200 hover:text-white">View FCS review</button>
  </> : fcsRecordBySymbol.has(company.symbol) ? <>
    <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-100"><CheckCircle2 className="h-3.5 w-3.5" /> {fcsRecordBySymbol.get(company.symbol)!.lifecycleReady ? `FCS & lifecycle available · ${fcsRecordBySymbol.get(company.symbol)!.lifecycle}` : "FCS report available · lifecycle pending"}</span>
    <div className="mt-2 text-[9px] leading-relaxed text-zinc-400">{fcsRecordBySymbol.get(company.symbol)!.lifecycleReady ? `${fcsRecordBySymbol.get(company.symbol)!.checkpoints}/3 comparable checkpoints are available.` : `The four-factor score is available. Lifecycle has ${fcsRecordBySymbol.get(company.symbol)!.checkpoints}/3 comparable checkpoints.`}</div>
    <button type="button" onClick={() => onBrowseLibrary(company.symbol)} className="mt-2 block text-[9px] font-black uppercase tracking-[0.08em] text-cyan-200 hover:text-white">Open FCS report</button>
  </> : reviewJobs[company.symbol] && isFundamentalReviewInProgress(reviewJobs[company.symbol].status) ? <>
    <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-amber-100"><Clock3 className="h-3.5 w-3.5" /> {reviewStatusLabel(reviewJobs[company.symbol].status)}</span>
    <div className="mt-2 text-[9px] leading-relaxed text-zinc-400">{reviewJobs[company.symbol].message}</div>
    <button type="button" onClick={() => setSelectedStatusSymbol(company.symbol)} className="mt-2 block text-[9px] font-black uppercase tracking-[0.08em] text-zinc-300 hover:text-white">View processing status</button>
  </> : <>
    <span className="text-[10px] font-semibold text-zinc-200">No FCS report yet</span>
    <div className="mt-2 text-[9px] leading-relaxed text-zinc-400">No conclusion about FCS availability or publishability has been made.</div>
    {reviewRequestsAvailable && (reviewRequestScope === "radar_universe" || reviewSupportedSymbols.has(company.symbol)) ? <><button type="button" onClick={() => showRequestConfirmation(company)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-300/[0.07] px-2.5 py-2 text-[9px] font-black uppercase tracking-[0.06em] text-cyan-100 hover:border-cyan-300/50 hover:text-white"><TrendingUp className="h-3.5 w-3.5" /> Start FCS Review</button><div className="mt-1 text-[8px] leading-relaxed text-zinc-500">Usually takes 10–15 minutes · you may leave and return</div></> : <><button type="button" disabled className="mt-3 inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.025] px-2.5 py-2 text-[9px] font-black uppercase tracking-[0.06em] text-zinc-500"><Clock3 className="h-3.5 w-3.5" /> New FCS request unavailable</button><div className="mt-1 text-[8px] leading-relaxed text-zinc-500">{reviewRequestMessage}</div></>}
  </>;

  return <main className="min-h-screen bg-app-bg pt-24 pb-16 px-4 md:px-6 text-zinc-100">
    <div className="max-w-7xl mx-auto">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-200 mb-7 transition-colors">
        <BarChart3 className="w-4 h-4" /> Methodology &amp; validation record
      </button>
      <section className="rounded-[28px] border border-cyan-400/20 bg-gradient-to-br from-[#0d1728] via-[#101a2b] to-[#0b1321] overflow-hidden shadow-2xl">
        <header className="px-5 py-6 md:px-8 md:py-8 border-b border-white/10">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300 mb-3"><Compass className="w-4 h-4" /> {activeRadarData.universe.scanned.toLocaleString("en-IN")}-company discovery layer</div>
              <h1 className="text-3xl md:text-5xl font-display font-semibold tracking-tight text-white">Momentum Radar</h1>
              <p className="mt-3 text-sm md:text-base text-zinc-400 max-w-3xl leading-relaxed">A deterministic market-guided queue for deciding which companies should receive Fundamental Change evidence work next. It does not alter Fundamental Change Scores or lifecycles.</p>
              <p className="mt-2 text-xs text-cyan-100/70 max-w-3xl leading-relaxed">The first five queued companies show the trajectory-aware Lifecycle V2.1 test result. Official market-cap segments come from source-dated NSE index membership; companies outside those indices remain in a clearly labelled Broader NSE lane. Liquidity never determines company size.</p>
              <p className="mt-2 text-[11px] font-semibold text-zinc-300">Market data through {activeRadarData.market_data.as_of_date} · snapshot generated {new Date(activeRadarData.generated_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
              {radarRefreshWarning && <p className="mt-2 max-w-3xl rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-[10px] leading-relaxed text-amber-100">{radarRefreshWarning}</p>}
            </div>
            <div className="flex max-w-md flex-col gap-3">
            <button type="button" onClick={() => onBrowseLibrary()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-300/[0.10] px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100 hover:bg-emerald-300/[0.16]"><BookOpen className="h-4 w-4" /> Browse Fundamental Change Library</button>
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-xs text-amber-100 leading-relaxed">
              <strong className="block mb-1">Experimental—not a return forecast</strong>
              Rankings use provisional adjusted market data and require walk-forward validation before they can become a product gate or investment signal.
            </div>
            </div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {[
              ["Universe scanned", `${activeRadarData.universe.scanned}`, expandedMode ? "Official NSE EQ and BE universe" : "Exact monitored FCS universe"],
              ["Analysable liquid universe", `${momentumReadyCompanies.length}`, expandedMode ? "Liquidity-qualified with full price history" : "Complete market history"],
              ["Active momentum signals", `${companies.length}`, expandedMode ? `${activeSignalSummary.starting} Early Uptrend · ${activeSignalSummary.confirmed} Established Uptrend · ${activeSignalSummary.extended} Stretched Uptrend` : "Displayed below"],
            ].map(([label, value, note]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.15em] font-black text-zinc-500">{label}</div><div className="mt-2 text-2xl font-mono font-bold text-white">{value}</div><div className="mt-1 text-xs text-zinc-500">{note}</div>
            </div>)}
          </div>
        </header>

        {expandedMode && <nav id="direction-radar-view" aria-label="Momentum direction" className="scroll-mt-24 grid gap-3 border-b border-white/10 bg-black/10 px-5 py-5 md:grid-cols-3 md:px-8">
          <button type="button" aria-pressed={directionView === "positive"} onClick={() => selectDirection("positive")} className={`rounded-2xl border px-5 py-4 text-left transition ${directionView === "positive" ? "border-emerald-300/55 bg-emerald-300/[0.12] text-white shadow-lg shadow-emerald-950/20" : "border-white/10 bg-white/[0.025] text-zinc-400 hover:border-emerald-300/30 hover:text-white"}`}><div className="text-[10px] font-black uppercase tracking-[0.14em]">Positive Direction</div><div className="mt-2 font-mono text-2xl font-bold">{companies.length}</div><div className="mt-1 text-[10px] opacity-70">Early, Established and Stretched Uptrends</div></button>
          <button type="button" aria-pressed={directionView === "negative"} onClick={() => selectDirection("negative")} className={`rounded-2xl border px-5 py-4 text-left transition ${directionView === "negative" ? "border-rose-300/55 bg-rose-300/[0.12] text-white shadow-lg shadow-rose-950/20" : "border-white/10 bg-white/[0.025] text-zinc-400 hover:border-rose-300/30 hover:text-white"}`}><div className="text-[10px] font-black uppercase tracking-[0.14em]">Negative Direction</div><div className="mt-2 font-mono text-2xl font-bold">{inactiveCounts.deteriorating}</div><div className="mt-1 text-[10px] opacity-70">Early, Established and Stretched Downtrends</div></button>
          <button type="button" aria-pressed={directionView === "neutral"} onClick={() => selectDirection("neutral")} className={`rounded-2xl border px-5 py-4 text-left transition ${directionView === "neutral" ? "border-slate-300/50 bg-slate-300/[0.12] text-white shadow-lg shadow-slate-950/20" : "border-white/10 bg-white/[0.025] text-zinc-400 hover:border-slate-300/30 hover:text-white"}`}><div className="text-[10px] font-black uppercase tracking-[0.14em]">No Directional Setup</div><div className="mt-2 font-mono text-2xl font-bold">{inactiveCounts.dormant}</div><div className="mt-1 text-[10px] opacity-70">Mixed evidence without a confirmed direction</div></button>
        </nav>}

        {directionView === "positive" && <div className="px-5 py-5 md:px-8 border-b border-white/10">
          <div className="flex flex-col gap-4">
            <div><div className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-300">Directional momentum review</div><h2 className="mt-2 text-2xl font-semibold text-white">Positive price direction</h2><p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-400">These companies passed the liquidity and price-history checks and currently show an Early, Established or Stretched Uptrend. FCS relationship labels remain independent and appear only where comparable fundamental history exists.</p></div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {visibleStates.map((state) => <button key={state} type="button" onClick={() => setFilter(state)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] ${filter === state ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-zinc-500 hover:text-white"}`}>{state === "ALL" && expandedMode ? "ACTIVE SIGNALS" : stateLabel[state as RadarState]} {stateCounts[state] ?? 0}</button>)}
            </div>
            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {segments.map((item) => <button key={item} type="button" onClick={() => setSegment(item)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] ${segment === item ? "border-violet-300/50 bg-violet-300/15 text-violet-100" : "border-white/10 text-zinc-500 hover:text-white"}`}>{item === "ALL" ? "ALL" : segmentLabel(item)} {segmentCounts[item]}</button>)}
              </div>
              <label className="relative block md:ml-auto md:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search active momentum signals" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-300/40" /></label>
            </div>
            {expandedMode && <p className="text-[10px] leading-relaxed text-zinc-500">The main radar contains only liquid, full-history companies with an Early, Established or Stretched Uptrend. These labels describe current measured conditions; they are not claims that a phase will generate a particular future return.</p>}
          </div>
        </div>}

        <div className="p-5 md:p-8">
          {directionView === "positive" && <>
          {!!filtered.length && <div className="mb-3 flex flex-col gap-1 text-[10px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
            <span>{filtered.length.toLocaleString("en-IN")} companies match the active filters.</span>
            <span>{filtered.length > displayed.length ? `Showing the first ${displayed.length}; use state, segment or search to narrow the universe.` : `Showing all ${displayed.length}.`}</span>
          </div>}
          <div className="rounded-2xl border border-white/10 overflow-x-auto">
            <table className="w-full min-w-[1290px] table-fixed text-left">
              <thead className="bg-[#182235] text-[10px] uppercase tracking-[0.11em] text-zinc-300"><tr><th className="sticky left-0 z-20 w-[175px] bg-[#182235] px-4 py-3.5">Company / Segment</th><th className="w-[225px] px-4 py-3.5">Momentum State / Radar Score</th><th className="w-[145px] px-4 py-3.5"><span className="block">Medium-term</span><span className="mt-1 block normal-case tracking-normal text-[9px] font-medium text-zinc-400">Latest month excluded</span></th><th className="w-[205px] px-4 py-3.5"><span className="block">Current trigger</span><span className="mt-1 block normal-case tracking-normal text-[9px] font-medium text-zinc-400">Latest completed session</span></th><th className="w-[180px] px-4 py-3.5">Relative strength</th><th className="w-[245px] px-4 py-3.5">FCS / Lifecycle</th><th className="w-[115px] px-4 py-3.5">Research</th></tr></thead>
              <tbody className="divide-y divide-white/[0.07]">{displayed.map((company) => <tr key={company.symbol} className="hover:bg-white/[0.025]">
                <td className="sticky left-0 z-10 bg-[#101827] px-4 py-4"><div className="font-semibold text-white">{company.symbol}</div><div className="mt-1 truncate text-[11px] text-zinc-300">{company.company_name}</div><div className="mt-2"><span className="rounded-full border border-violet-400/25 bg-violet-400/[0.08] px-2 py-1 text-[9px] font-black text-violet-100">{segmentLabel(company.market_cap_segment.label)}</span></div><div className="mt-2 truncate text-[9px] text-zinc-400" title={company.market_cap_segment.source_index ?? "Outside official size indices"}>{company.market_cap_segment.source_index ?? "Outside official size indices"}</div></td>
                <td className="px-4 py-4"><div className="flex items-center justify-between gap-3"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${stateStyle[company.radar_state as RadarState]}`}>{stateLabel[company.radar_state as RadarState]}</span><span className="font-mono text-xl font-bold text-white">{company.experimental_rank_score ?? "—"}</span></div><div className={`mt-2 text-[9px] font-black uppercase tracking-[0.08em] ${directionPresentation[momentumDirection(company.radar_state as RadarState)].style}`}>{directionPresentation[momentumDirection(company.radar_state as RadarState)].label}</div><div className="mt-2 text-[10px] leading-relaxed text-zinc-300">{stateMeaning[company.radar_state as RadarState]}</div><div className={`mt-3 text-[9px] font-black uppercase tracking-[0.08em] ${momentumPriorityStatus(company).style}`}>{momentumPriorityStatus(company).label}</div><div className="mt-1 text-[9px] leading-relaxed text-zinc-400">{momentumPriorityStatus(company).reason}</div><div className="mt-3 border-t border-white/[0.07] pt-3"><div className={`text-[9px] font-black uppercase tracking-[0.08em] ${fundamentalRelationship(company).style}`}>{fundamentalRelationship(company).label}</div><div className="mt-1 text-[9px] leading-relaxed text-zinc-400">{fundamentalRelationship(company).detail}</div></div></td>
                <td className="px-4 py-4"><div className="space-y-2 text-[10px]"><div className="flex justify-between gap-3"><span className="text-zinc-300">12 months to 1 month</span><span className="font-mono text-white">{pct(company.momentum_12_1)}</span></div><div className="flex justify-between gap-3"><span className="text-zinc-300">6 months to 1 month</span><span className="font-mono text-white">{pct(company.momentum_6_1)}</span></div><div className="text-[9px] leading-relaxed text-zinc-400">Both periods exclude the latest month · as of {company.as_of_date}</div></div></td>
                <td className="px-4 py-4">{company.current_momentum_trigger ? <div><div className={`text-[10px] font-black uppercase tracking-[0.1em] ${triggerSummary(company.current_momentum_trigger).style}`}>{triggerSummary(company.current_momentum_trigger).label}</div><div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]"><span className="text-zinc-300">20-day</span><span className="text-right font-mono text-white">{pct(company.current_momentum_trigger.momentum_20d)}</span><span className="text-zinc-300">5-day</span><span className="text-right font-mono text-white">{pct(company.current_momentum_trigger.momentum_5d)}</span><span className="text-zinc-300">Volume</span><span className="text-right font-mono text-white">{ratio(company.current_momentum_trigger.traded_value_acceleration_5_vs_prior_20)}</span><span className="text-zinc-300">Breakout</span><span className="text-right text-white">{breakoutLabel(company.current_momentum_trigger.breakout_status)}</span></div><div className="mt-2 text-[9px] text-zinc-400">As of {company.current_momentum_trigger.as_of_date}</div></div> : <span className="text-[10px] text-zinc-400">Insufficient current-session history</span>}</td>
                <td className="px-4 py-4"><div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[10px]"><span className="text-zinc-300">Universe</span><span className="text-right font-mono text-white">{pct(company.relative_strength_to_universe)}</span><span className="col-span-2 truncate text-[9px] text-zinc-400" title={`${segmentLabel(company.universe_benchmark ?? "Unavailable")} · ${company.universe_peer_count} peers`}>{segmentLabel(company.universe_benchmark ?? "Unavailable")} · {company.universe_peer_count} peers</span><span className="mt-1 text-zinc-300">Sector</span><span className="mt-1 text-right font-mono text-white">{pct(company.relative_strength_to_sector)}</span><span className="col-span-2 truncate text-[9px] text-zinc-400" title={`${company.sector_benchmark ?? "Unavailable"} · ${company.sector_peer_count} peers`}>{company.sector_benchmark ?? "Unavailable"} · {company.sector_peer_count} peers</span></div></td>
                <td className="px-4 py-4">{renderFcsStatus(company)}</td>
                <td className="px-4 py-4"><button type="button" onClick={() => onDeepDive({ symbol: company.symbol, company_name: company.company_name, bms_status: lifecycleBySymbol.has(company.symbol) || fcsRecordBySymbol.get(company.symbol)?.lifecycleReady ? "ready" : fcsRecordBySymbol.has(company.symbol) ? "fcs_ready" : reviewJobs[company.symbol] && isFundamentalReviewInProgress(reviewJobs[company.symbol].status) ? "processing" : "not_requested" })} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gold/35 bg-gold/[0.10] px-2 py-2 text-center text-[9px] font-black uppercase leading-relaxed tracking-[0.06em] text-gold hover:border-gold/60 hover:text-white"><BookOpen className="h-3.5 w-3.5 shrink-0" /> Open Deep Dive</button></td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
          {expandedMode && directionView !== "positive" && <section id="inactive-momentum-section" className="overflow-hidden border-y border-slate-400/20 bg-slate-400/[0.035]">
            <header className="border-b border-white/10 p-5 md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                 <div><div className={`text-[9px] font-black uppercase tracking-[0.18em] ${directionView === "negative" ? "text-rose-300" : "text-slate-400"}`}>Directional momentum review</div><h2 className="mt-2 text-2xl font-semibold text-white">{directionView === "negative" ? "Negative price direction" : "No directional setup"}</h2><p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-400">{directionView === "negative" ? "These companies passed the same liquidity and price-history checks and are classified as Early, Established or Stretched Downtrends. They receive a Downside Pressure Score—not the positive Radar Score." : "These companies passed the liquidity and price-history requirements, but their trend indicators do not presently agree strongly enough to establish either positive or negative direction."}</p>{directionView === "negative" && <p className="mt-2 text-[10px] text-rose-200/80">{downsideSummary.EARLY_DOWNTREND} Early · {downsideSummary.ESTABLISHED_DOWNTREND} Established · {downsideSummary.STRETCHED_DOWNTREND} Stretched · {downsideSummary.potentiallyOversold} potentially oversold warnings</p>}</div>
               </div>
              <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {segments.map((item) => <button key={item} type="button" onClick={() => setInactiveSegment(item)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] ${inactiveSegment === item ? "border-violet-300/50 bg-violet-300/15 text-violet-100" : "border-white/10 text-zinc-500 hover:text-white"}`}>{item === "ALL" ? "ALL" : segmentLabel(item)} {inactiveSegmentCounts[item]}</button>)}
                </div>
                <label className="relative block w-full md:ml-auto md:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" /><input value={inactiveQuery} onChange={(event) => setInactiveQuery(event.target.value)} placeholder={directionView === "negative" ? "Search negative direction" : "Search no directional setup"} className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-slate-300/40" /></label>
              </div>
              {inactiveFilter === "DETERIORATING" && <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {([
                  ["ALL", "ALL DOWNTRENDS", inactiveCounts.deteriorating],
                  ["EARLY_DOWNTREND", "EARLY DOWNTREND", downsideSummary.EARLY_DOWNTREND],
                  ["ESTABLISHED_DOWNTREND", "ESTABLISHED DOWNTREND", downsideSummary.ESTABLISHED_DOWNTREND],
                  ["STRETCHED_DOWNTREND", "STRETCHED DOWNTREND", downsideSummary.STRETCHED_DOWNTREND],
                  ["POTENTIALLY_OVERSOLD", "POTENTIALLY OVERSOLD", downsideSummary.potentiallyOversold],
                ] as const).map(([phase, label, count]) => <button key={phase} type="button" onClick={() => setDownsidePhaseFilter(phase)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] ${downsidePhaseFilter === phase ? "border-rose-300/50 bg-rose-300/15 text-rose-100" : "border-white/10 text-zinc-500 hover:text-white"}`}>{label} {count}</button>)}
              </div>}
            </header>
            <div className="p-5 md:p-6">
              <div className="mb-3 flex flex-col gap-1 text-[10px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between"><span>{filteredInactiveCompanies.length.toLocaleString("en-IN")} companies match this view.</span><span>{filteredInactiveCompanies.length > displayedInactiveCompanies.length ? `Showing the first ${displayedInactiveCompanies.length}; use segment, phase or search to narrow the universe.` : `Showing all ${displayedInactiveCompanies.length}.`}</span></div>
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[1290px] table-fixed text-left">
                  <thead className="bg-[#182235] text-[10px] uppercase tracking-[0.11em] text-zinc-300"><tr><th className="w-[175px] px-4 py-3.5">Company / Segment</th><th className="w-[225px] px-4 py-3.5">{directionView === "negative" ? "Directional State / Downside Pressure" : "Directional State"}</th><th className="w-[145px] px-4 py-3.5"><span className="block">Medium-term</span><span className="mt-1 block normal-case tracking-normal text-[9px] font-medium text-zinc-400">Latest month excluded</span></th><th className="w-[205px] px-4 py-3.5"><span className="block">Current trigger</span><span className="mt-1 block normal-case tracking-normal text-[9px] font-medium text-zinc-400">Latest completed session</span></th><th className="w-[180px] px-4 py-3.5">Relative strength</th><th className="w-[245px] px-4 py-3.5">FCS / Lifecycle</th><th className="w-[115px] px-4 py-3.5">Research</th></tr></thead>
                  <tbody className="divide-y divide-white/[0.07]">{displayedInactiveCompanies.map((company) => <tr key={company.symbol} className="hover:bg-white/[0.025]">
                    <td className="px-4 py-4"><div className="font-semibold text-white">{company.symbol}</div><div className="mt-1 truncate text-[11px] text-zinc-300">{company.company_name}</div><div className="mt-2"><span className="rounded-full border border-violet-400/25 bg-violet-400/[0.08] px-2 py-1 text-[9px] font-black text-violet-100">{segmentLabel(company.market_cap_segment.label)}</span></div><div className="mt-2 truncate text-[9px] text-zinc-400" title={company.market_cap_segment.source_index ?? "Outside official size indices"}>{company.market_cap_segment.source_index ?? "Outside official size indices"}</div></td>
                    <td className="px-4 py-4"><div className="flex items-center justify-between gap-3"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${stateStyle[company.radar_state as RadarState]}`}>{directionalStateLabel(company)}</span><span className="font-mono text-xl font-bold text-white">{downsideAssessment(company)?.downsidePressureScore ?? "—"}</span></div><div className={`mt-2 text-[9px] font-black uppercase tracking-[0.08em] ${directionPresentation[momentumDirection(company.radar_state as RadarState)].style}`}>{directionPresentation[momentumDirection(company.radar_state as RadarState)].label}</div><div className="mt-2 text-[10px] leading-relaxed text-zinc-300">{stateMeaning[company.radar_state as RadarState]}</div>{downsideAssessment(company)?.potentiallyOversold && <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-2 py-1.5 text-[9px] font-semibold text-amber-100">Potentially Oversold · {downsideAssessment(company)?.recoveryConfirmed ? "recovery trigger confirmed" : "reversal not confirmed"}</div>}<div className="mt-3 border-t border-white/[0.07] pt-3"><div className={`text-[9px] font-black uppercase tracking-[0.08em] ${fundamentalRelationship(company).style}`}>{fundamentalRelationship(company).label}</div><div className="mt-1 text-[9px] leading-relaxed text-zinc-400">{fundamentalRelationship(company).detail}</div></div></td>
                    <td className="px-4 py-4"><div className="space-y-2 text-[10px]"><div className="flex justify-between gap-3"><span className="text-zinc-300">12 months to 1 month</span><span className="font-mono text-white">{pct(company.momentum_12_1)}</span></div><div className="flex justify-between gap-3"><span className="text-zinc-300">6 months to 1 month</span><span className="font-mono text-white">{pct(company.momentum_6_1)}</span></div><div className="text-[9px] leading-relaxed text-zinc-400">Both periods exclude the latest month · as of {company.as_of_date}</div></div></td>
                    <td className="px-4 py-4">{company.current_momentum_trigger ? <div><div className={`text-[10px] font-black uppercase tracking-[0.1em] ${triggerSummary(company.current_momentum_trigger).style}`}>{triggerSummary(company.current_momentum_trigger).label}</div><div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]"><span className="text-zinc-300">20-day</span><span className="text-right font-mono text-white">{pct(company.current_momentum_trigger.momentum_20d)}</span><span className="text-zinc-300">5-day</span><span className="text-right font-mono text-white">{pct(company.current_momentum_trigger.momentum_5d)}</span><span className="text-zinc-300">Volume</span><span className="text-right font-mono text-white">{ratio(company.current_momentum_trigger.traded_value_acceleration_5_vs_prior_20)}</span><span className="text-zinc-300">Breakout</span><span className="text-right text-white">{breakoutLabel(company.current_momentum_trigger.breakout_status)}</span></div><div className="mt-2 text-[9px] text-zinc-400">As of {company.current_momentum_trigger.as_of_date}</div></div> : <span className="text-[10px] text-zinc-400">Insufficient current-session history</span>}</td>
                    <td className="px-4 py-4"><div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[10px]"><span className="text-zinc-300">Universe</span><span className="text-right font-mono text-white">{pct(company.relative_strength_to_universe)}</span><span className="col-span-2 truncate text-[9px] text-zinc-400" title={`${segmentLabel(company.universe_benchmark ?? "Unavailable")} · ${company.universe_peer_count} peers`}>{segmentLabel(company.universe_benchmark ?? "Unavailable")} · {company.universe_peer_count} peers</span><span className="mt-1 text-zinc-300">Sector</span><span className="mt-1 text-right font-mono text-white">{pct(company.relative_strength_to_sector)}</span><span className="col-span-2 truncate text-[9px] text-zinc-400" title={`${company.sector_benchmark ?? "Unavailable"} · ${company.sector_peer_count} peers`}>{company.sector_benchmark ?? "Unavailable"} · {company.sector_peer_count} peers</span></div></td>
                    <td className="px-4 py-4">{renderFcsStatus(company)}</td>
                    <td className="px-4 py-4"><button type="button" onClick={() => onDeepDive({ symbol: company.symbol, company_name: company.company_name, bms_status: lifecycleBySymbol.has(company.symbol) || fcsRecordBySymbol.get(company.symbol)?.lifecycleReady ? "ready" : fcsRecordBySymbol.has(company.symbol) ? "fcs_ready" : reviewJobs[company.symbol] && isFundamentalReviewInProgress(reviewJobs[company.symbol].status) ? "processing" : "not_requested" })} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gold/35 bg-gold/[0.10] px-2 py-2 text-center text-[9px] font-black uppercase leading-relaxed tracking-[0.06em] text-gold hover:border-gold/60 hover:text-white"><BookOpen className="h-3.5 w-3.5 shrink-0" /> Open Deep Dive</button></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </div>
          </section>}
          {directionView === "positive" && !filtered.length && <div className="py-16 text-center">
            <div className="text-sm font-semibold text-zinc-300">No companies match this combination of filters.</div>
            <div className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-zinc-500">The companies have not disappeared from the radar. This state, segment or gate intersection is empty. Return to the full universe to inspect every category.</div>
            <button type="button" onClick={() => { setFilter("ALL"); setSegment("ALL"); setQuery(""); }} className="mt-4 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200 hover:text-white">Show all active signals</button>
          </div>}
          {selectedStatusCompany && <section className="mt-6 rounded-3xl border border-amber-400/20 bg-amber-400/[0.035] p-5 md:p-6">
            <div className="flex items-start justify-between gap-4"><div><div className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-200">Fundamental Change Review status</div><h2 className="mt-2 text-xl font-semibold text-white">{selectedStatusCompany.company_name} <span className="font-mono text-sm text-zinc-500">{selectedStatusCompany.symbol}</span></h2></div><div className="flex items-center gap-2"><button type="button" onClick={refreshFundamentalReviewStatus} disabled={refreshingStatus} className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white disabled:opacity-50" aria-label="Refresh review status"><RefreshCw className={`h-4 w-4 ${refreshingStatus ? "animate-spin" : ""}`} /></button><button type="button" onClick={() => setSelectedStatusSymbol(null)} className="rounded-xl border border-white/10 p-2 text-zinc-500 hover:text-white" aria-label="Close processing status"><X className="h-4 w-4" /></button></div></div>
            <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-2xl border border-amber-400/20 bg-black/15 p-4"><div className="text-[9px] font-black uppercase tracking-[0.13em] text-zinc-500">Current state</div><div className="mt-2 text-sm font-bold text-amber-200">{selectedRuntimeJob ? reviewStatusLabel(selectedRuntimeJob.status) : "Evidence work queued"}</div></div><div className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="text-[9px] font-black uppercase tracking-[0.13em] text-zinc-500">Validated factors</div><div className="mt-2 text-sm font-bold text-zinc-300">{selectedRuntimeJob ? `${selectedRuntimeJob.completedFactors} of 4` : "Pending worker update"}</div></div><div className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="text-[9px] font-black uppercase tracking-[0.13em] text-zinc-500">Lifecycle V2.1</div><div className="mt-2 text-sm font-bold text-zinc-300">{selectedRuntimeJob?.status === "ready" ? "Ready" : "Activates after publishable FCS history"}</div></div></div>
            <p className="mt-4 max-w-4xl text-xs leading-relaxed text-zinc-300">{selectedRuntimeJob?.message || "The company has been prioritised for Earnings, Economics, Execution and Balance Sheet evidence work. No score or lifecycle is estimated while the evidence contract remains incomplete."}</p>
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">You do not need to keep this page open. Use the refresh control when you return. An incomplete result remains explicitly unavailable rather than being estimated.</p>
            <button type="button" onClick={() => onDeepDive({ symbol: selectedStatusCompany.symbol, company_name: selectedStatusCompany.company_name, bms_status: "processing" })} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gold/25 bg-gold/[0.08] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-gold hover:border-gold/50 hover:text-white"><BookOpen className="h-4 w-4" /> Open independent Deep Dive</button>
          </section>}
          {selectedStudy && latestCheckpoint && <section id="momentum-bms-study" className="scroll-mt-24 mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.035] overflow-hidden">
            <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-white/10 p-5 md:p-6">
              <div><div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Momentum-selected · evidence-qualified Fundamental Change study</div><h2 className="mt-2 text-2xl font-semibold text-white">{selectedStudy.company_name} <span className="font-mono text-base text-zinc-500">{selectedStudy.symbol}</span></h2><p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-400">Momentum determined research priority only. The Fundamental Change Score (BMS V2 methodology) and Lifecycle V2.1 classification below were calculated independently from four-factor company evidence.</p></div>
              <div className="flex items-center gap-2"><button type="button" onClick={() => onDeepDive({ symbol: selectedStudy.symbol, company_name: selectedStudy.company_name, bms_status: lifecycleBySymbol.has(selectedStudy.symbol) ? "ready" : "fcs_ready" })} className="inline-flex items-center gap-2 rounded-xl border border-gold/25 bg-gold/[0.08] px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-gold hover:border-gold/50 hover:text-white"><BookOpen className="h-3.5 w-3.5" /> Open company deep dive</button><button type="button" onClick={() => setSelectedStudySymbol(null)} className="rounded-xl border border-white/10 p-2 text-zinc-500 hover:text-white" aria-label="Close Fundamental Change study"><X className="h-4 w-4" /></button></div>
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
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><TrendingUp className="w-4 h-4 text-cyan-300 mb-2" /><strong className="text-white">What the rank means</strong><p className="mt-1">A cross-sectional work-queue priority based on the 12-month-to-1-month and 6-month-to-1-month trends, the latest 3-month trend, Nifty 500 relative strength, trend structure, 52-week position and volume confirmation. The two medium-term measurements deliberately exclude the latest month.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><ShieldAlert className="w-4 h-4 text-amber-300 mb-2" /><strong className="text-white">What it does not mean</strong><p className="mt-1">It is not a recommendation, expected return, FCS factor, lifecycle input or substitute for company evidence. Short-history companies remain unranked.</p></div>
            <div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.035] p-4 md:col-span-2"><strong className="text-rose-100">Negative-direction method</strong><p className="mt-1">Downside Pressure is the inverse of the same positive-oriented cross-sectional percentile score. Early, Established and Stretched Downtrends use progressively stricter trend agreement and volatility-adjusted distance rules. Potentially Oversold is only a warning flag; no reversal is suggested unless price regains its 50-session average, 20-day and 5-day returns are positive, and relative strength is positive.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 md:col-span-2"><strong className="text-white">How companies are selected for fundamental review</strong><p className="mt-1">A company can be selected when it has at least 252 sessions, an Early or Established Uptrend, no critical stale-data issue, and passes the deterministic liquidity rule. The current threshold is {money(activeRadarData.summary.liquidity_universe?.threshold_inr ?? activeRadarData.selection_gate_policy.minimum_traded_value_inr)} median daily traded value over 60 sessions, with at least 90% trading frequency over 126 sessions. Stretched Uptrends remain visible on the radar but are not prioritised for fresh evidence work because the move may already be mature. Segment source date: {activeRadarData.segment_registry.as_of_date}.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 md:col-span-2"><strong className="text-white">Peer-relative strength</strong><p className="mt-1">“Vs universe” compares the company’s blended 6–1 and 3-month momentum with the median of its official large-, mid-, small-, micro-cap or Broader NSE peer group. “Vs sector” is shown only when an official NSE industry label exists and at least five peers are available.</p></div>
            <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4 md:col-span-2"><strong className="text-cyan-100">Current trigger—kept separate from the rank</strong><p className="mt-1">The 20-session and 5-session returns use the latest completed session. Volume acceleration compares recent five-session average traded value with the preceding 20 sessions. A breakout is confirmed only when the latest close exceeds the prior 55-session high and volume acceleration is at least 1.25×. These current readings do not change the existing momentum score, radar classification, FCS or lifecycle.</p></div>
          </div>
        </div>
      </section>
      {requestCandidate && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="fundamental-review-title">
        <div className="w-full max-w-lg rounded-3xl border border-cyan-300/25 bg-[#111b2d] p-6 shadow-2xl md:p-7">
          <div className="flex items-start justify-between gap-4"><div><div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Optional evidence workflow</div><h2 id="fundamental-review-title" className="mt-2 text-2xl font-semibold text-white">Start Fundamental Change Review?</h2></div><button type="button" onClick={() => !requestSubmitting && setRequestCandidate(null)} className="rounded-xl border border-white/10 p-2 text-zinc-500 hover:text-white" aria-label="Cancel review request"><X className="h-4 w-4" /></button></div>
          <p className="mt-4 text-sm leading-relaxed text-zinc-300"><strong className="text-white">{requestCandidate.company_name} ({requestCandidate.symbol})</strong> will be checked across Earnings, Economics, Execution and Balance Sheet evidence.</p>
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4 text-xs leading-relaxed text-amber-100"><strong className="block">Expected time: normally 10–15 minutes</strong><span className="mt-1 block text-zinc-300">Difficult filings or missing comparable periods can take longer. You may leave this page and return later. A score will be shown only if the evidence contract passes.</span></div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4 text-xs leading-relaxed text-zinc-400"><strong className="text-zinc-200">Separate from Deep Dive.</strong> Starting this review creates the four-factor FCS workflow. Opening a Deep Dive provides broader company research and does not start or alter FCS.</div>
          {requestError && <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/[0.08] p-3 text-xs leading-relaxed text-rose-200">{requestError}<div className="mt-1 text-zinc-400">No processing status has been changed.</div></div>}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={requestSubmitting} onClick={() => setRequestCandidate(null)} className="rounded-xl border border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:text-white disabled:opacity-50">Cancel</button><button type="button" disabled={requestSubmitting} onClick={requestFundamentalReview} className="rounded-xl border border-cyan-300/35 bg-cyan-300/[0.12] px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-100 hover:bg-cyan-300/[0.18] disabled:opacity-50">{requestSubmitting ? "Submitting…" : "Start FCS Review"}</button></div>
        </div>
      </div>}
    </div>
  </main>;
}
