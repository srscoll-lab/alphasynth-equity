import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Activity,
  Sparkles,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  Eye,
  Zap,
  Layers3,
  ShieldCheck,
} from "lucide-react";
import { motion } from "motion/react";

type BmsTrajectoryPoint = {
  period: string;
  bms: number;
  momentum_state: string;
  evidence_count: number;
};

type LifecycleStage =
  | "WATCH"
  | "EMERGING"
  | "BUILDING"
  | "ESTABLISHED"
  | "OUTSIDE";

type BmsCompany = {
  symbol: string;
  period: string;
  bms: number;
  momentum_state: string;
  evidence_count: number;
  earnings: number;
  economics: number;
  execution: number;
  balance_sheet: number;
  management_delivery: number;
  previous_bms: number | null;
  previous2_bms: number | null;
  bms_change: number | null;
  improving_streak: number;
  lifecycle_stage: LifecycleStage;
  lifecycle_qualification: string | null;
  fading_warning: boolean;
  bms_trajectory: BmsTrajectoryPoint[];
};

type BmsResponse = {
  name: string;
  company_count: number;
  stage_counts?: {
    watch: number;
    emerging: number;
    building: number;
    established: number;
    outside: number;
    fading_warnings: number;
  };
  companies: BmsCompany[];
  unavailable?: boolean;
  message?: string;
};

type Props = {
  onResearch?: (company: BmsCompany) => void;
};

// Investor-facing BMS Change Score.
//
// IMPORTANT:
// This transforms the raw BMS/TCS ONLY for display.
// It does not modify the underlying BMS/TCS calculation.
//
// Raw TCS:
//   -0.40 = strong deterioration
//    0.00 = broadly neutral change
//   +0.40 = strong improvement
//
// Display:
//      0 = strong deterioration
//     50 = broadly neutral change
//    100 = strong improvement
const score100 = (value: number) =>
  Math.max(
    0,
    Math.min(
      100,
      Math.round(50 + (value / 0.4) * 50)
    )
  );

// Convert a raw quarter-on-quarter TCS/BMS movement into
// investor-facing Change Score POINTS.
//
// Example:
//   raw +0.292 -> +37 score points
//   raw -0.200 -> -25 score points
const scorePointChange = (value: number) =>
  Math.max(
    -50,
    Math.min(
      50,
      Math.round((value / 0.4) * 50)
    )
  );

type FundamentalMomentumLabel =
  | "STRONG POSITIVE"
  | "POSITIVE"
  | "NEUTRAL"
  | "NEGATIVE"
  | "STRONG NEGATIVE";

function fundamentalMomentumLabel(value: number): FundamentalMomentumLabel {
  if (value >= 0.30) return "STRONG POSITIVE";
  if (value >= 0.10) return "POSITIVE";
  if (value > -0.10) return "NEUTRAL";
  if (value > -0.30) return "NEGATIVE";
  return "STRONG NEGATIVE";
}

// Investor-facing lifecycle terminology only.
// Backend lifecycle classifications remain unchanged.
function momentumStageLabel(company: BmsCompany): string {
  if (company.fading_warning) return "FADING";

  if (
    company.lifecycle_stage === "BUILDING" ||
    company.lifecycle_stage === "ESTABLISHED"
  ) {
    return "SUSTAINED";
  }

  if (company.lifecycle_stage === "EMERGING") {
    return "EMERGING";
  }

  return "WATCH";
}

function momentumStageClass(company: BmsCompany): string {
  const stage = momentumStageLabel(company);

  if (stage === "FADING") {
    return "text-amber-300 border-amber-400/20 bg-amber-400/[0.07]";
  }

  if (stage === "SUSTAINED") {
    return "text-gold border-gold/20 bg-gold/[0.07]";
  }

  if (stage === "EMERGING") {
    return "text-emerald-300 border-emerald-400/20 bg-emerald-400/[0.07]";
  }

  return "text-sky-300 border-sky-400/20 bg-sky-400/[0.07]";
}

const factor100 = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value * 100)));

const stageMeta = {
  WATCH: {
    label: "Watch",
    description: "Early evidence worth monitoring",
    icon: Eye,
    className: "text-sky-300 border-sky-400/20 bg-sky-400/[0.07]",
  },
  EMERGING: {
    label: "Emerging",
    description: "A meaningful positive inflection is forming",
    icon: Zap,
    className: "text-teal-300 border-teal-400/20 bg-teal-400/[0.07]",
  },
  BUILDING: {
    label: "Building",
    description: "Momentum is gaining confirmation",
    icon: Layers3,
    className: "text-emerald-300 border-emerald-400/20 bg-emerald-400/[0.07]",
  },
  ESTABLISHED: {
    label: "Established",
    description: "Strong momentum has persisted",
    icon: ShieldCheck,
    className: "text-gold border-gold/20 bg-gold/[0.07]",
  },
  OUTSIDE: {
    label: "Outside",
    description: "No active lifecycle signal",
    icon: Activity,
    className: "text-zinc-400 border-white/10 bg-white/[0.03]",
  },
} as const;

function researchAction(company: BmsCompany) {
  // Action states are deterministic translations of the BMS lifecycle.
  // They indicate the next RESEARCH action — never a buy/sell recommendation.

  if (company.fading_warning) {
    return {
      state: "REASSESS",
      priority: "HIGH — RISK REVIEW",
      title: "Previous Momentum Is Weakening",
      copy: "Earlier business momentum has deteriorated materially. Re-examine the original thesis before relying on the previous signal.",
      nextTrigger: "Look for evidence that the deterioration is temporary and that the key business drivers begin to stabilise or recover.",
      tone: "rose",
    };
  }

  if (
    company.lifecycle_stage === "EMERGING" &&
    company.lifecycle_qualification === "ACCELERATING"
  ) {
    return {
      state: "INVESTIGATE NOW",
      priority: "HIGH",
      title: "Early Inflection Deserves Attention",
      copy: "A meaningful positive business inflection has appeared and is accelerating. Investigate the underlying drivers while the change is still early.",
      nextTrigger: "Test whether the improvement is broad-based, repeatable and supported by management execution.",
      tone: "emerald",
    };
  }

  if (
    company.lifecycle_stage === "BUILDING" &&
    company.lifecycle_qualification === "ACCELERATING"
  ) {
    return {
      state: "INVESTIGATE NOW",
      priority: "HIGH",
      title: "Confirmed Momentum Is Accelerating",
      copy: "The earlier improvement has persisted and is strengthening further. This warrants deeper research into the durability of the acceleration.",
      nextTrigger: "Look for continued earnings, economics and execution improvement without deterioration in balance-sheet quality.",
      tone: "emerald",
    };
  }

  if (
    company.lifecycle_stage === "BUILDING" &&
    company.lifecycle_qualification === "MATURE"
  ) {
    return {
      state: "WAIT FOR CONFIRMATION",
      priority: "MEDIUM",
      title: "Momentum Is Developed, Not Accelerating",
      copy: "The business has established meaningful momentum, but the current signal is no longer an early acceleration. Assess whether the strength can persist.",
      nextTrigger: "A renewed improvement in the next result or another important operating driver would strengthen the case.",
      tone: "amber",
    };
  }

  if (company.lifecycle_stage === "BUILDING") {
    return {
      state: "WAIT FOR CONFIRMATION",
      priority: "MEDIUM",
      title: "Improvement Has Persisted",
      copy: "The initial improvement has survived confirmation, but further evidence is needed before treating it as a stronger acceleration signal.",
      nextTrigger: "Look for another period of improving fundamentals or broader confirmation across the BMS factors.",
      tone: "amber",
    };
  }

  if (company.lifecycle_stage === "ESTABLISHED") {
    return {
      state: "WAIT FOR CONFIRMATION",
      priority: "MEDIUM",
      title: "Strong Momentum Is Already Established",
      copy: "Momentum has persisted across multiple observations. The research question is now sustainability rather than discovery of a new inflection.",
      nextTrigger: "Watch for continued delivery and signs that established strength is either reaccelerating or beginning to fade.",
      tone: "amber",
    };
  }

  if (company.lifecycle_stage === "WATCH") {
    return {
      state: "WAIT FOR CONFIRMATION",
      priority: "LOW",
      title: "Interesting, But Too Early",
      copy: "There is enough evidence to keep this business on the radar, but not enough confirmation to escalate the signal yet.",
      nextTrigger: "Wait for the next meaningful result or operating datapoint to confirm that the change is becoming persistent.",
      tone: "amber",
    };
  }

  return {
    state: "STAND ASIDE",
    priority: "LOW",
    title: "No Active Momentum Signal",
    copy: "Current BMS evidence does not justify prioritising this company for momentum research.",
    nextTrigger: "Revisit if a future result produces a meaningful positive change in the underlying business factors.",
    tone: "zinc",
  };
}

export default function BusinessMomentum({ onResearch }: Props) {
  const [data, setData] = useState<BmsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<BmsCompany | null>(null);
  const [explanation, setExplanation] = useState("");
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState("");
  const [activeStage, setActiveStage] =
    useState<"WATCH" | "EMERGING" | "SUSTAINED" | "FADING">(
      "EMERGING"
    );

  const loadBms = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/bms/lifecycle");
      if (!response.ok) throw new Error("Business Momentum service unavailable");

      const payload: BmsResponse = await response.json();
      setData(payload);
    } catch (err: any) {
      setError(err?.message || "Unable to load Business Momentum");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBms();
  }, []);

  const companies = useMemo(
    () => [...(data?.companies || [])],
    [data]
  );

  const stageCompanies = useMemo(() => {
    const filtered = companies.filter(
      (company) => momentumStageLabel(company) === activeStage
    );

    return filtered.sort((a, b) => {
      if (activeStage === "EMERGING") {
        return (b.bms_change ?? -999) - (a.bms_change ?? -999);
      }

      if (activeStage === "FADING") {
        return (a.bms_change ?? 999) - (b.bms_change ?? 999);
      }

      return b.bms - a.bms;
    });
  }, [companies, activeStage]);

  useEffect(() => {
    if (!stageCompanies.length) {
      setSelected(null);
      return;
    }

    if (!selected || !stageCompanies.some((c) => c.symbol === selected.symbol)) {
      setSelected(stageCompanies[0]);
    }
  }, [stageCompanies, selected]);

  useEffect(() => {
    if (!selected) {
      setExplanation("");
      setExplanationError("");
      return;
    }

    let cancelled = false;

    const loadExplanation = async () => {
      setExplanationLoading(true);
      setExplanationError("");
      setExplanation("");

      try {
        const response = await fetch("/api/bms/explain", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            symbol: selected.symbol,
            period: selected.period,
            bms: selected.bms,
            previous_bms: selected.previous_bms,
            previous2_bms: selected.previous2_bms,
            bms_change: selected.bms_change,
            lifecycle_stage: selected.lifecycle_stage,
            lifecycle_qualification: selected.lifecycle_qualification,
            fading_warning: selected.fading_warning,
            evidence_count: selected.evidence_count,
            earnings: selected.earnings,
            economics: selected.economics,
            execution: selected.execution,
            balance_sheet: selected.balance_sheet,
            management_delivery: selected.management_delivery,
          }),
        });

        if (!response.ok) {
          throw new Error("Momentum explanation unavailable");
        }

        const payload = await response.json();

        if (!cancelled) {
          setExplanation(String(payload.explanation || "").trim());
        }
      } catch (err: any) {
        if (!cancelled) {
          setExplanationError(
            err?.message || "Momentum explanation temporarily unavailable"
          );
        }
      } finally {
        if (!cancelled) {
          setExplanationLoading(false);
        }
      }
    };

    loadExplanation();

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const counts = data?.stage_counts;
  const action = selected ? researchAction(selected) : null;
  const selectedMeta = selected ? stageMeta[selected.lifecycle_stage] : null;
  const selectedMomentum = selected
    ? fundamentalMomentumLabel(selected.bms)
    : null;
  const selectedStage = selected
    ? momentumStageLabel(selected)
    : null;

  const investorStageCounts = {
    WATCH: companies.filter(
      (company) => momentumStageLabel(company) === "WATCH"
    ).length,
    EMERGING: companies.filter(
      (company) => momentumStageLabel(company) === "EMERGING"
    ).length,
    SUSTAINED: companies.filter(
      (company) => momentumStageLabel(company) === "SUSTAINED"
    ).length,
    FADING: companies.filter(
      (company) => momentumStageLabel(company) === "FADING"
    ).length,
  };

  const stages = [
    {
      id: "WATCH" as const,
      label: "Watch",
      count: investorStageCounts.WATCH,
    },
    {
      id: "EMERGING" as const,
      label: "Emerging",
      count: investorStageCounts.EMERGING,
    },
    {
      id: "SUSTAINED" as const,
      label: "Sustained",
      count: investorStageCounts.SUSTAINED,
    },
    {
      id: "FADING" as const,
      label: "Fading",
      count: investorStageCounts.FADING,
    },
  ];

  return (
    <section className="relative overflow-hidden border-b border-app-border bg-[#080b12]">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 left-[12%] w-[560px] h-[560px] rounded-full bg-emerald-500/10 blur-[150px]" />
        <div className="absolute top-0 right-[4%] w-[460px] h-[460px] rounded-full bg-sky-500/[0.07] blur-[140px]" />
        <div className="absolute top-[260px] left-[50%] w-[380px] h-[380px] rounded-full bg-gold/[0.06] blur-[140px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 pt-32 pb-20">
        <div className="grid lg:grid-cols-[1.05fr_.95fr] gap-12 items-end mb-12">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/5 text-emerald-300 text-[10px] font-black uppercase tracking-[0.22em] mb-6"
            >
              <Activity className="w-3.5 h-3.5" />
              Business Momentum Intelligence
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
              className="text-5xl md:text-7xl font-display font-semibold tracking-tight leading-[1.02] text-white mb-6"
            >
              Find the change
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-gold">
                before it becomes obvious.
              </span>
            </motion.h1>

            <p className="max-w-2xl text-zinc-400 text-base md:text-lg leading-relaxed">
              AlphaSynth follows the journey of business momentum — from the first
              signs of change to persistent improvement, and warns when the thesis
              begins to fade.
            </p>
          </div>

          <div className="lg:justify-self-end w-full max-w-md">
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-500">
                    Momentum Universe
                  </p>
                  <p className="text-sm text-zinc-300 mt-1">
                    Latest lifecycle state across the tracked universe
                  </p>
                </div>

                <button
                  onClick={loadBms}
                  className="p-2 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
                  title="Refresh Business Momentum"
                >
                  <RefreshCw
                    className={`w-4 h-4 text-zinc-400 ${
                      loading ? "animate-spin" : ""
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-end gap-3">
                <span className="text-6xl font-display font-semibold text-white">
                  {loading ? "—" : data?.company_count ?? 0}
                </span>
                <div className="pb-2">
                  <p className="text-emerald-300 font-bold">businesses tracked</p>
                  <p className="text-xs text-zinc-500">
                    through the BMS lifecycle
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-white/10 flex items-center gap-2 text-xs text-zinc-500">
                <Sparkles className="w-4 h-4 text-gold" />
                Deterministic signal · research action, not investment advice
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {stages.map((stage) => {
            const active = activeStage === stage.id;

            return (
              <button
                key={stage.id}
                onClick={() => setActiveStage(stage.id)}
                className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                  active
                    ? "border-emerald-400/35 bg-emerald-400/[0.08]"
                    : "border-white/10 bg-white/[0.025] hover:bg-white/[0.045]"
                }`}
              >
                <p className="text-[9px] uppercase tracking-[0.18em] font-black text-zinc-500">
                  {stage.label}
                </p>
                <p className="text-2xl font-mono font-bold text-white mt-1">
                  {loading ? "—" : stage.count}
                </p>
              </button>
            );
          })}
        </div>



        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-red-300">
            {error}
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1.12fr_.88fr] gap-6">
            <div className="rounded-3xl border border-white/10 bg-[#0d1119]/90 overflow-hidden">
              <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] font-black text-gold">
                    Momentum Lifecycle Radar
                  </p>
                  <h2 className="text-xl font-semibold text-white mt-1">
                    {activeStage === "FADING"
                      ? "Fading momentum"
                      : `${activeStage.charAt(0)}${activeStage.slice(1).toLowerCase()} businesses`}
                  </h2>
                </div>
                <span className="text-xs text-zinc-500">
                  {stageCompanies.length} companies
                </span>
              </div>

              <div className="divide-y divide-white/[0.06]">
                {loading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-[84px] animate-pulse bg-white/[0.015]"
                    />
                  ))}

                {!loading &&
                  stageCompanies.slice(0, 12).map((company, index) => (
                    <button
                      key={company.symbol}
                      onClick={() => setSelected(company)}
                      className={`w-full px-6 py-4 flex items-center gap-4 text-left transition-all ${
                        selected?.symbol === company.symbol
                          ? company.fading_warning
                            ? "bg-amber-400/[0.06]"
                            : "bg-emerald-400/[0.07]"
                          : "hover:bg-white/[0.025]"
                      }`}
                    >
                      <span className="w-7 text-xs font-mono text-zinc-600">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold text-white">
                            {company.symbol}
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${momentumStageClass(company)}`}
                          >
                            {momentumStageLabel(company)}
                          </span>
                        </div>

                        <p className="text-xs text-zinc-500 mt-1">
                          {company.period} · {company.evidence_count} evidence points
                          {company.bms_change !== null && (
                            <>
                              {" · "}
                              <span
                                className={
                                  company.bms_change >= 0
                                    ? "text-emerald-400"
                                    : "text-amber-300"
                                }
                              >
                                QoQ {company.bms_change >= 0 ? "+" : ""}
                                {scorePointChange(company.bms_change)} pts
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-[9px] uppercase tracking-widest text-zinc-600 font-black">
                          BMS
                        </p>
                        <p className="text-xl font-mono font-bold text-emerald-300">
                          {score100(company.bms)}
                        </p>
                      </div>

                      <ArrowRight className="w-4 h-4 text-zinc-600" />
                    </button>
                  ))}

                {!loading && stageCompanies.length === 0 && (
                  <div className="p-10 text-center text-zinc-500">
                    No companies currently qualify for this lifecycle stage.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#111720] to-[#0b0e14] p-7 min-h-[520px]">
              {selected && action && selectedMeta ? (
                <>
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300 mb-2">
                        Momentum Snapshot
                      </p>
                      <h2 className="text-3xl font-display font-semibold text-white">
                        {selected.symbol}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span
                          className={`px-3 py-1.5 rounded-full border text-[11px] uppercase tracking-[0.08em] font-black ${selectedMeta.className}`}
                        >
                          {selectedStage}
                        </span>


                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="w-20 h-20 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] flex flex-col items-center justify-center">
                        <span className="text-[11px] font-black text-emerald-300 text-center leading-tight px-2">
                          {selectedMomentum}
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.12em] font-semibold text-zinc-400 text-center leading-tight">
                          CURRENT FUNDAMENTAL MOMENTUM
                        </span>
                      </div>

                      <span
                        className={`text-[9px] font-mono ${
                          selected.bms_change > 0
                            ? "text-emerald-300"
                            : selected.bms_change < 0
                            ? "text-amber-300"
                            : "text-zinc-500"
                        }`}
                      >
                        {selected.bms_change > 0
                          ? "↑"
                          : selected.bms_change < 0
                          ? "↓"
                          : "→"}{" "}
                        {selected.bms_change > 0 ? "+" : ""}
                        {scorePointChange(selected.bms_change)} pts QoQ
                      </span>
                    </div>
                  </div>

                  <div className="mb-5 px-1">
                    <p className="text-[11px] text-zinc-400 leading-relaxed max-w-2xl">
                      <span className="font-bold text-zinc-300">
                        What BMS means:{" "}
                      </span>
                      Current Fundamental Momentum shows the <span className="font-bold text-emerald-300">present strength of change in the underlying business</span> — from strong positive improvement through neutral change to deterioration.
                    </p>

                    <p className="text-[9px] text-zinc-500 mt-1.5 leading-relaxed">
                      Momentum Stage shows <span className="font-bold text-zinc-400">how that change is evolving over time</span> — Watch, Emerging, Sustained or Fading. It is <span className="font-bold text-zinc-400">not a company-quality, valuation or investment recommendation.</span>
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[9px] uppercase tracking-[0.18em] font-black text-zinc-500">
                        Momentum Trajectory
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        <span className="text-zinc-500">Persistence: </span>
                        {selected.improving_streak > 0
                          ? `${selected.improving_streak} consecutive improving ${selected.improving_streak === 1 ? "quarter" : "quarters"}`
                          : "Not established yet"}
                      </span>
                    </div>

                    <div className="flex items-end gap-2">
                      {(selected.bms_trajectory || []).map((point) => (
                        <div key={point.period} className="flex-1">
                          <div className="h-16 flex items-end">
                            <div
                              className={`w-full rounded-t-md ${
                                point.bms >= 0
                                  ? "bg-emerald-400/40"
                                  : "bg-amber-400/35"
                              }`}
                              style={{
                                height: `${Math.max(
                                  8,
                                  Math.min(64, Math.abs(point.bms) * 140)
                                )}px`,
                              }}
                            />
                          </div>
                          <p className="text-center text-[9px] text-zinc-600 mt-2">
                            {point.period}
                          </p>
                          <p className="text-center text-[8px] font-bold text-zinc-400 uppercase leading-tight">
                            {fundamentalMomentumLabel(point.bms)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {[
                      ["Earnings", selected.earnings],
                      ["Economics", selected.economics],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <div className="flex justify-between text-xs mb-2">
                          <span className="text-zinc-400">{label}</span>
                          <span className="font-mono text-zinc-300">
                            {factor100(Number(value))}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300"
                            style={{ width: `${factor100(Number(value))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.035] p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-emerald-300" />
                      <span className="text-[10px] uppercase tracking-[0.18em] font-black text-emerald-300">
                        What changed
                      </span>
                    </div>

                    {explanationLoading ? (
                      <p className="text-sm text-zinc-500 animate-pulse">
                        Analyzing the momentum signal...
                      </p>
                    ) : explanation ? (
                      <p className="text-sm text-zinc-300 leading-relaxed">
                        {explanation}
                      </p>
                    ) : (
                      <p className="text-sm text-zinc-500 leading-relaxed">
                        {explanationError ||
                          "Momentum explanation is temporarily unavailable."}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-gold" />
                        <span className="text-[10px] uppercase tracking-[0.18em] font-black text-gold">
                          Momentum Brief
                        </span>
                      </div>

                      <span className="px-2 py-1 rounded-lg border border-white/10 bg-white/[0.04] text-[9px] font-black tracking-widest text-zinc-300">
                        RESEARCH PRIORITY: {action.priority}
                      </span>
                    </div>

                    <div className={`rounded-xl border p-4 ${
                      action.tone === "emerald"
                        ? "border-emerald-400/20 bg-emerald-400/[0.06]"
                        : action.tone === "rose"
                        ? "border-rose-400/20 bg-rose-400/[0.06]"
                        : action.tone === "amber"
                        ? "border-amber-400/20 bg-amber-400/[0.06]"
                        : "border-white/10 bg-white/[0.025]"
                    }`}>
                      <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${
                        action.tone === "emerald"
                          ? "text-emerald-300"
                          : action.tone === "rose"
                          ? "text-rose-300"
                          : action.tone === "amber"
                          ? "text-amber-300"
                          : "text-zinc-400"
                      }`}>
                        {action.state}
                      </p>

                      <p className="text-base font-semibold text-white mt-2">
                        {action.title}
                      </p>

                      <p className="text-sm text-zinc-400 leading-relaxed mt-2">
                        {action.copy}
                      </p>
                    </div>

                    <div className="mt-4 border-t border-white/[0.07] pt-4">
                      <p className="text-[9px] uppercase tracking-[0.18em] font-black text-zinc-500 mb-2">
                        What would change the signal?
                      </p>
                      <p className="text-sm text-zinc-300 leading-relaxed">
                        {action.nextTrigger}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-gold/15 bg-gold/[0.025] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.18em] font-black text-zinc-500">
                          Optional Further Research
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Run the full AlphaSynth research pipeline only if you want a comprehensive company analysis.
                        </p>
                      </div>

                      <button
                        onClick={() => onResearch?.(selected)}
                        className="shrink-0 flex items-center justify-center gap-2 rounded-xl border border-gold/30 bg-gold/[0.08] text-gold px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] hover:bg-gold/[0.14] transition-all"
                      >
                        Full Deep Dive
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-500">
                  Select a business to inspect its momentum.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-[11px] text-zinc-600">
          <p>
            BMS identifies changes in business fundamentals. Research priorities are
            workflow prompts, not buy/sell recommendations.
          </p>
          <p>
            Market Recognition will be layered on separately from Business Momentum.
          </p>
        </div>
      </div>
    </section>
  );
}
