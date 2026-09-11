import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserRoundCheck,
} from "lucide-react";
import type { ResearchDossier } from "../dossier";
import { assessDossierReadiness, type DossierReadinessCheck } from "../dossier-readiness";
import { augmentFactorAnalysisWithDeliveryEvidence, type BmsFactorAnalysis, BMS_FACTOR_DEFINITIONS } from "../bms-factor-schema";
import type { ExpectationDeliveryAssessment, ExpectationDeliveryInput, QualityGateObservation } from "../expectation-delivery";
import type { ManagementGuidanceDeliveryAssessment } from "../management-guidance-delivery";
import type { DossierPdfPayload } from "../dossier-pdf";

type EvidenceTab = "methodology" | "delivery" | "quality" | "sources";

export type SignalEvidenceCompany = {
  symbol: string;
  name: string;
  lifecycle: string;
  rawBms: number;
  bmsChange: number;
  period: string;
  evidenceStrength: string;
  evidenceCount: number;
};

type DeliveryCheck = {
  input: ExpectationDeliveryInput;
  assessment: ExpectationDeliveryAssessment;
  managementGuidance?: {
    status: "available" | "insufficient_history" | "unavailable";
    assessment: ManagementGuidanceDeliveryAssessment | null;
    reason?: string | null;
  };
  qualification?: {
    status: "qualified" | "qualified_with_caution" | "not_qualified" | "insufficient_evidence";
    asOf: string;
    reasons: string[];
    lifecycleUnchanged: true;
  };
};

type LayerData = {
  dossier: ResearchDossier;
  financials: DossierPdfPayload["financials"];
  enrichment: DossierPdfPayload["enrichment"];
  market: DossierPdfPayload["market"];
  factorAnalysis: BmsFactorAnalysis | null;
  deliveryCheck: DeliveryCheck | null;
  readiness: DossierReadinessCheck;
};

const qualificationStyle = {
  qualified: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  qualified_with_caution: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  not_qualified: "border-red-400/30 bg-red-400/10 text-red-300",
  insufficient_evidence: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
};

const gateStyle: Record<QualityGateObservation["result"], string> = {
  pass: "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300",
  fail: "border-red-400/25 bg-red-400/[0.06] text-red-300",
  not_due: "border-sky-400/25 bg-sky-400/[0.06] text-sky-300",
  unknown: "border-zinc-600/40 bg-white/[0.025] text-zinc-400",
};

const displayScore = (value: number | null | undefined) => value == null
  ? null
  : Math.max(0, Math.min(100, Math.round(50 + (value / 0.75) * 50)));

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${value.slice(0, 10)}T00:00:00`));
};

const readable = (value: string | null | undefined) => value
  ? value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase())
  : "Unavailable";

const metricText = (metric: BmsFactorAnalysis["factors"][number]["current"]["metrics"][number]) => {
  if (metric.displayValue) return metric.displayValue;
  if (metric.value === null) return "N/A";
  return `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
};

export default function SignalEvidenceLayer({
  company,
  signalDate,
  onClose,
}: {
  company: SignalEvidenceCompany;
  signalDate: string;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<EvidenceTab>("methodology");
  const [data, setData] = useState<LayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    setData(null);

    const post = (url: string, body: unknown) => fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    (async () => {
      try {
        const basicRequest = { ticker: company.symbol };
        const [dossierResponse, financialPayload, enrichmentPayload, marketPayload, factorPayload] = await Promise.all([
          post("/api/dossier/generate", {
            ticker: company.symbol,
            company_name: company.name,
            reporting_period: company.period,
          }),
          post("/api/pipeline/quarterly-performance", basicRequest)
            .then(response => response.ok ? response.json() : null).catch(() => null),
          post("/api/pipeline/report-extras", { ticker: company.symbol, signal: company.lifecycle })
            .then(response => response.ok ? response.json() : null).catch(() => null),
          post("/api/bms/market-context", basicRequest)
            .then(response => response.ok ? response.json() : null).catch(() => null),
          fetch(`/api/bms/factor-analysis/${encodeURIComponent(company.symbol)}`, { signal: controller.signal })
            .then(response => response.ok ? response.json() : null).catch(() => null),
        ]);
        const dossierPayload = await dossierResponse.json();
        if (!dossierResponse.ok) throw new Error(dossierPayload?.error || "The evidence report could not be prepared.");
        const financials = Array.isArray(financialPayload?.rows) ? financialPayload.rows : [];
        const deliveryResponse = await post("/api/bms/delivery-check", {
          dossier: dossierPayload,
          lifecycle: company.lifecycle,
          financials,
        });
        const deliveryPayload = deliveryResponse.ok ? await deliveryResponse.json() as DeliveryCheck : null;
        const factorAnalysis = augmentFactorAnalysisWithDeliveryEvidence(
          factorPayload?.factor_analysis ?? null,
          deliveryPayload,
        );
        const readinessPayload: DossierPdfPayload = {
          dossier: dossierPayload,
          financials,
          enrichment: enrichmentPayload || null,
          market: marketPayload || null,
          bms: {
            score: displayScore(company.rawBms),
            stage: company.lifecycle,
            period: company.period,
            factorAnalysis,
          },
          deliveryCheck: deliveryPayload,
        };
        if (!active) return;
        setData({
          dossier: dossierPayload,
          financials,
          enrichment: enrichmentPayload || null,
          market: marketPayload || null,
          factorAnalysis,
          deliveryCheck: deliveryPayload,
          readiness: assessDossierReadiness(readinessPayload),
        });
      } catch (requestError: any) {
        if (!active || requestError?.name === "AbortError") return;
        setError(requestError?.message || "The evidence report could not be prepared.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [company, reloadKey]);

  const qualification = data?.deliveryCheck?.qualification;
  const qualificationStatus = qualification?.status ?? "insufficient_evidence";
  const factors = data?.factorAnalysis?.factors ?? [];
  const qualityGates = data?.deliveryCheck?.input.qualityGates ?? [];
  const management = data?.deliveryCheck?.managementGuidance;
  const supportedClaims = useMemo(() => data
    ? Object.values(data.dossier.sections).flat().filter(claim => claim.status === "supported").length
    : 0, [data]);

  const downloadPdf = async () => {
    if (!data?.readiness.ready) return;
    setDownloading(true);
    try {
      const response = await fetch("/api/dossier/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dossier: data.dossier,
          financials: data.financials,
          enrichment: data.enrichment,
          market: data.market,
          bms: {
            score: displayScore(company.rawBms),
            stage: company.lifecycle,
            period: company.period,
            factorAnalysis: data.factorAnalysis,
          },
          deliveryCheck: data.deliveryCheck,
        }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(failure?.error || "The PDF could not be generated.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${company.symbol}-Research-Dossier-${data.dossier.generatedAt.slice(0, 10)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError: any) {
      window.alert(downloadError?.message || "The PDF could not be generated.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="min-h-screen bg-app-bg pt-20 pb-16 px-4 md:px-6 text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <button type="button" onClick={onClose} className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to signal tracker
        </button>

        <section className="overflow-hidden rounded-[28px] border border-teal-400/20 bg-gradient-to-br from-[#0d1728] via-[#101a2b] to-[#0b1321] shadow-2xl">
          <header className="border-b border-white/10 px-5 py-6 md:px-8 md:py-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-300">Signal evidence workspace · {company.symbol}</div>
                <h1 className="mt-3 text-3xl font-semibold text-white md:text-5xl">Why this signal?</h1>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400 md:text-base">
                  {company.name.replace(/[.\s]+$/, "")}. The BMS V1 record is preserved as of {formatDate(signalDate)}; this workspace explains its evidence and subsequent confirmation checks without rewriting it.
                </p>
              </div>
              <div className="grid min-w-[290px] grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[9px] font-black uppercase tracking-wider text-zinc-500">BMS display score</div>
                  <div className="mt-2 text-3xl font-mono font-bold text-white">{displayScore(company.rawBms)}</div>
                  <div className="mt-1 text-xs text-zinc-500">{company.lifecycle} · {company.period}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Evidence qualification</div>
                  <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${qualificationStyle[qualificationStatus]}`}>
                    {readable(qualificationStatus)}
                  </span>
                  <div className="mt-2 text-[10px] text-zinc-500">Separate from BMS V1</div>
                </div>
              </div>
            </div>
          </header>

          {loading && (
            <div className="flex min-h-[520px] flex-col items-center justify-center px-6 text-center">
              <LoaderCircle className="h-8 w-8 animate-spin text-teal-300" />
              <h2 className="mt-5 text-xl font-semibold text-white">Building the evidence view</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-500">Collecting admitted company evidence, comparable financial history, BMS factors, quality gates and the stored management record. This may take a few minutes.</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex min-h-[480px] flex-col items-center justify-center px-6 text-center">
              <TriangleAlert className="h-8 w-8 text-amber-300" />
              <h2 className="mt-4 text-xl font-semibold text-white">Evidence view unavailable</h2>
              <p className="mt-2 max-w-xl text-sm text-zinc-400">{error}</p>
              <button type="button" onClick={() => setReloadKey(value => value + 1)} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-teal-400/30 bg-teal-400/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-teal-200 hover:bg-teal-400/15">
                <RefreshCw className="h-4 w-4" /> Try again
              </button>
            </div>
          )}

          {!loading && data && (
            <>
              <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-8">
                <nav className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-1" aria-label="Evidence sections">
                  {([
                    ["methodology", "BMS methodology"],
                    ["delivery", "Delivery check"],
                    ["quality", "Quality & management"],
                    ["sources", "Sources & limits"],
                  ] as Array<[EvidenceTab, string]>).map(([id, label]) => (
                    <button key={id} type="button" onClick={() => setActiveTab(id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${activeTab === id ? "bg-teal-300 text-slate-950" : "text-zinc-400 hover:text-white"}`}>
                      {label}
                    </button>
                  ))}
                </nav>
                <button type="button" onClick={downloadPdf} disabled={!data.readiness.ready || downloading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-400/25 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-blue-300 hover:bg-blue-400/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-600 disabled:hover:bg-transparent">
                  {downloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {data.readiness.ready ? "Download full PDF" : "PDF not yet available"}
                </button>
              </div>

              <div className="px-5 py-7 md:px-8 md:py-9">
                {activeTab === "methodology" && (
                  <section>
                    <div className="max-w-3xl">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-teal-300"><BarChart3 className="h-4 w-4" /> Five-factor measurement bridge</div>
                      <h2 className="mt-3 text-2xl font-semibold text-white md:text-3xl">What the BMS score considered</h2>
                      <p className="mt-3 text-sm leading-relaxed text-zinc-400">A score and confidence answer different questions. The score describes measured direction; confidence describes the completeness and comparability of the evidence supporting it.</p>
                    </div>
                    <div className="mt-7 space-y-4">
                      {factors.map(factor => {
                        const definition = BMS_FACTOR_DEFINITIONS.find(item => item.id === factor.id);
                        const score = displayScore(factor.current.factorScore);
                        const comparable = factor.previous.metrics.length > 0 && factor.current.metrics.length > 0;
                        return (
                          <article key={factor.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 md:p-6">
                            <div className="grid gap-5 lg:grid-cols-[190px_1fr]">
                              <div>
                                <div className="text-lg font-semibold text-white">{factor.label}</div>
                                <div className="mt-3 flex items-end gap-3"><span className="text-3xl font-mono font-bold text-teal-300">{comparable && score !== null ? score : "N/A"}</span><span className="pb-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">{factor.weight * 100}% weight</span></div>
                                <div className="mt-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">{comparable ? `${factor.confidence} confidence` : "No comparable evidence"}</div>
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-zinc-200">{definition?.purpose}</p>
                                <p className="mt-1 text-xs text-zinc-500">Evidence considered: {definition?.evidenceSignals}. Cadence: {readable(definition?.cadence)}.</p>
                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                  {([["Previous", factor.previous], ["Current", factor.current]] as const).map(([label, measurement]) => (
                                    <div key={label} className="rounded-xl border border-white/[0.07] bg-black/15 p-3">
                                      <div className="text-[9px] font-black uppercase tracking-wider text-zinc-500">{label} · {measurement.period || "period unavailable"}</div>
                                      {measurement.metrics.length ? <div className="mt-2 space-y-1 text-xs text-zinc-300">{measurement.metrics.slice(0, 4).map(metric => <div key={metric.key} className="flex justify-between gap-4"><span className="text-zinc-500">{metric.label}</span><span className="text-right">{metricText(metric)}</span></div>)}</div> : <p className="mt-2 text-xs text-zinc-600">Structured measurements not supplied.</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}

                {activeTab === "delivery" && (
                  <section>
                    <div className="max-w-3xl">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-sky-300"><CheckCircle2 className="h-4 w-4" /> Reconstructed confirmation layer</div>
                      <h2 className="mt-3 text-2xl font-semibold text-white md:text-3xl">Did subsequently published delivery support the signal?</h2>
                      <p className="mt-3 text-sm leading-relaxed text-zinc-400">This comparison helps rank research priorities inside the recorded lifecycle. It cannot rewrite the BMS V1 result or create a recommendation.</p>
                    </div>
                    {data.deliveryCheck ? (
                      <>
                        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {[
                            ["Recorded lifecycle", data.deliveryCheck.assessment.lifecycle],
                            ["Delivery direction", readable(data.deliveryCheck.assessment.deliveryDirection)],
                            ["Metric coverage", `${data.deliveryCheck.assessment.deliveryCoverage}%`],
                            ["Quality reading", readable(data.deliveryCheck.assessment.qualityStatus)],
                          ].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="text-[9px] font-black uppercase tracking-wider text-zinc-500">{label}</div><div className="mt-2 text-lg font-semibold text-white">{value}</div></div>)}
                        </div>
                        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
                          <div className="hidden grid-cols-[1.5fr_repeat(4,0.7fr)] gap-3 bg-white/[0.04] px-5 py-3 text-[9px] font-black uppercase tracking-wider text-zinc-500 md:grid"><span>Measure</span><span>Previous</span><span>Current</span><span>Change</span><span>Direction</span></div>
                          {data.deliveryCheck.assessment.deliveryComponents.map(component => (
                            <div key={component.id} className="grid gap-2 border-t border-white/[0.07] px-5 py-4 first:border-t-0 md:grid-cols-[1.5fr_repeat(4,0.7fr)] md:gap-3">
                              <span className="text-sm font-medium text-zinc-200">{component.label}</span>
                              <span className="text-xs text-zinc-400"><span className="md:hidden">Previous: </span>{component.baseline}{component.unit}</span>
                              <span className="text-xs text-zinc-400"><span className="md:hidden">Current: </span>{component.outcome}{component.unit}</span>
                              <span className="text-xs text-zinc-300"><span className="md:hidden">Change: </span>{component.change > 0 ? "+" : ""}{component.change}{component.unit}</span>
                              <span className={`text-xs font-bold uppercase ${component.direction === "positive" ? "text-emerald-300" : component.direction === "negative" ? "text-red-300" : "text-zinc-400"}`}>{component.direction}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-5 rounded-2xl border border-sky-400/15 bg-sky-400/[0.04] p-5 text-sm leading-relaxed text-zinc-400">{data.deliveryCheck.assessment.explanation}</div>
                      </>
                    ) : <p className="mt-7 text-sm text-zinc-500">No comparable delivery assessment is currently available.</p>}
                  </section>
                )}

                {activeTab === "quality" && (
                  <section>
                    <div className="max-w-3xl">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-200"><ShieldCheck className="h-4 w-4" /> Qualification overlay</div>
                      <h2 className="mt-3 text-2xl font-semibold text-white md:text-3xl">Quality gates and management reliability</h2>
                      <p className="mt-3 text-sm leading-relaxed text-zinc-400">A gate can qualify, caution or exclude a company from the refined shortlist. Unknown and not-due observations never become automatic passes.</p>
                    </div>
                    <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {qualityGates.map(gate => (
                        <article key={gate.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                          <div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold text-white">{gate.label}</h3><span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${gateStyle[gate.result]}`}>{readable(gate.result)}</span></div>
                          <p className="mt-3 text-xs leading-relaxed text-zinc-500">{gate.explanation || (gate.result === "not_due" ? "This evidence is not scheduled for the current reporting cadence." : "No admissible observation was available.")}</p>
                          <div className="mt-3 text-[9px] uppercase tracking-wider text-zinc-600">{gate.severity} gate · {gate.evidenceRefs.length} evidence reference{gate.evidenceRefs.length === 1 ? "" : "s"}</div>
                        </article>
                      ))}
                    </div>
                    <div className="mt-7 rounded-2xl border border-teal-400/15 bg-teal-400/[0.035] p-5 md:p-6">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white"><UserRoundCheck className="h-5 w-5 text-teal-300" /> Management guidance and delivery</div>
                      {management?.assessment ? (
                        <div className="mt-5 grid gap-4 md:grid-cols-[220px_1fr]">
                          <div><div className="text-3xl font-mono font-bold text-teal-300">{management.assessment.score ?? "N/A"}</div><div className="mt-1 text-xs text-zinc-500">{readable(management.assessment.band)} · {readable(management.assessment.evidenceConfidence)} confidence</div></div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[
                            ["Commitments", management.assessment.commitmentCounts.uniqueCommitments],
                            ["Matured", management.assessment.commitmentCounts.matured],
                            ["Pending", management.assessment.commitmentCounts.pending],
                            ["Commentary changes", management.assessment.currentCommentary.length],
                          ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/[0.07] bg-black/15 p-3"><div className="text-lg font-bold text-white">{value}</div><div className="mt-1 text-[8px] font-black uppercase tracking-wider text-zinc-600">{label}</div></div>)}</div>
                        </div>
                      ) : <p className="mt-4 text-sm leading-relaxed text-zinc-500">{management?.reason || "No durable management-guidance history is currently available. The company is not assumed to have passed this check."}</p>}
                    </div>
                    {qualification?.reasons?.length ? <div className="mt-5 rounded-2xl border border-amber-400/15 bg-amber-400/[0.035] p-5"><div className="text-[10px] font-black uppercase tracking-wider text-amber-200">Why the current qualification applies</div><ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-400">{qualification.reasons.map(reason => <li key={reason}>• {reason}</li>)}</ul></div> : null}
                  </section>
                )}

                {activeTab === "sources" && (
                  <section>
                    <div className="max-w-3xl">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-blue-300"><FileCheck2 className="h-4 w-4" /> Provenance and completeness</div>
                      <h2 className="mt-3 text-2xl font-semibold text-white md:text-3xl">Sources, coverage and limits</h2>
                      <p className="mt-3 text-sm leading-relaxed text-zinc-400">The on-screen view can show incomplete evidence transparently. A downloadable report is enabled only when the same payload passes every PDF-readiness check.</p>
                    </div>
                    <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
                      ["Official sources", data.readiness.coverage.officialSources],
                      ["Supported claims", supportedClaims],
                      ["Comparable factors", `${data.readiness.coverage.completeBmsFactors}/5`],
                      ["Observed gates", data.readiness.coverage.observedQualityGates],
                    ].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="text-2xl font-bold text-white">{value}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wider text-zinc-500">{label}</div></div>)}</div>
                    {!data.readiness.ready && <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5"><div className="text-sm font-semibold text-amber-200">Why the PDF is not yet available</div><ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-400">{data.readiness.reasons.map(reason => <li key={reason}>• {reason}</li>)}</ul></div>}
                    <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
                      {data.dossier.sources.map((source, index) => (
                        <div key={source.sourceId} className={`grid gap-2 px-5 py-4 md:grid-cols-[110px_1fr_140px] md:items-center ${index ? "border-t border-white/[0.07]" : ""}`}>
                          <div className="text-[9px] font-black uppercase tracking-wider text-zinc-500">{source.sourceId}</div>
                          <a href={source.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm text-sky-300 hover:text-sky-200">{source.url} <ExternalLink className="ml-1 inline h-3 w-3" /></a>
                          <div className="text-xs text-zinc-500 md:text-right">Published {formatDate(source.publishedAt)}</div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-5 text-xs leading-relaxed text-zinc-600">This is a research-prioritisation aid, not investment advice. Missing values remain unavailable; social commentary cannot change BMS; and reconstructed delivery evidence is labelled separately from the prospectively recorded signal.</p>
                  </section>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
