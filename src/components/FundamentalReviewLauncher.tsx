import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, RefreshCw, Search, TrendingUp, X } from "lucide-react";
import expandedRadarData from "../data/bmsMomentumRadarExpanded.json";
import {
  isFundamentalReviewInProgress,
  normalizeFundamentalReviewJob,
  type FundamentalReviewJob,
} from "../fundamental-review-contract";

type UniverseCompany = (typeof expandedRadarData.companies)[number];

type Props = {
  availableSymbols: Set<string>;
  onOpenAvailable: (symbol: string) => void;
};

const statusLabel: Record<FundamentalReviewJob["status"], string> = {
  not_started: "FCS not started",
  queued: "Review queued",
  locating_evidence: "Locating evidence",
  validating_factors: "Validating four factors",
  scoring: "Calculating FCS",
  lifecycle_processing: "Evaluating lifecycle history",
  score_ready_lifecycle_pending: "FCS ready · lifecycle pending",
  ready: "FCS & lifecycle ready",
  incomplete: "Review completed without a publishable FCS",
  failed: "Review needs attention",
};

export default function FundamentalReviewLauncher({ availableSymbols, onOpenAvailable }: Props) {
  const [query, setQuery] = useState("");
  const [capabilityAvailable, setCapabilityAvailable] = useState(false);
  const [candidate, setCandidate] = useState<UniverseCompany | null>(null);
  const [job, setJob] = useState<FundamentalReviewJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/bms/fundamental-review/capabilities", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => { if (active) setCapabilityAvailable(payload?.available === true); })
      .catch(() => { if (active) setCapabilityAvailable(false); });
    return () => { active = false; };
  }, []);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return expandedRadarData.companies
      .filter((company) => company.symbol.toLowerCase().includes(normalized)
        || company.company_name.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [query]);

  const requestReview = async () => {
    if (!candidate || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/bms/fundamental-review/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: candidate.symbol, company_name: candidate.company_name }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "The FCS review could not be started.");
      const next = normalizeFundamentalReviewJob(payload?.job || payload, {
        symbol: candidate.symbol,
        companyName: candidate.company_name,
      });
      if (!next.jobId || (!isFundamentalReviewInProgress(next.status) && !next.resultAvailable)) {
        throw new Error("The worker did not return a durable job acknowledgement. No review was started.");
      }
      setJob(next);
      setCandidate(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The FCS review could not be started.");
    } finally {
      setSubmitting(false);
    }
  };

  const refreshStatus = async () => {
    if (!job || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch(`/api/bms/fundamental-review/status/${encodeURIComponent(job.symbol)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "The latest FCS status is unavailable.");
      setJob(normalizeFundamentalReviewJob(payload?.job || payload, { symbol: job.symbol, companyName: job.companyName }));
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "The latest FCS status is unavailable.");
    } finally {
      setRefreshing(false);
    }
  };

  return <section className="border-b border-white/10 bg-cyan-300/[0.025] px-5 py-6 md:px-8">
    <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr] lg:items-start">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Request a new Fundamental Change Review</div>
        <h2 className="mt-2 text-xl font-semibold text-white">Search beyond the Momentum shortlist</h2>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-400">Search all {expandedRadarData.companies.length.toLocaleString("en-IN")} companies in the scanned NSE discovery universe. A request starts the separate four-factor evidence workflow; Momentum Radar inclusion is not required and does not affect the FCS.</p>
        <label className="relative mt-4 block max-w-2xl"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter company name or NSE symbol" className="w-full rounded-xl border border-white/10 bg-black/25 py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-300/45" /></label>
        {!!matches.length && <div className="mt-2 max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-[#0d1626]">
          {matches.map((company) => {
            const alreadyAvailable = availableSymbols.has(company.symbol);
            return <div key={company.symbol} className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="font-semibold text-white">{company.symbol}</div><div className="text-xs text-zinc-500">{company.company_name}</div></div>
              {alreadyAvailable
                ? <button type="button" onClick={() => onOpenAvailable(company.symbol)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300/25 bg-emerald-300/[0.08] px-3 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" /> View existing FCS</button>
                : capabilityAvailable
                  ? <button type="button" onClick={() => { setError(""); setCandidate(company); }} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08] px-3 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-100"><TrendingUp className="h-3.5 w-3.5" /> Start FCS Review</button>
                  : <button type="button" disabled className="cursor-not-allowed rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-[9px] font-black uppercase tracking-[0.08em] text-zinc-500">FCS requests not yet enabled</button>}
            </div>;
          })}
        </div>}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-500">Latest requested review</div><div className="mt-2 text-sm font-semibold text-white">{job ? `${job.symbol} · ${statusLabel[job.status]}` : "No review requested in this session"}</div></div>{job && <button type="button" onClick={refreshStatus} disabled={refreshing} className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:text-white disabled:opacity-50" aria-label="Refresh FCS status"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /></button>}</div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">{job?.message || "After starting a review, its durable status appears here. You may leave and return; typical processing time is 10–15 minutes."}</p>
        {job && <div className="mt-3 text-[10px] text-zinc-600">Validated factors: {job.completedFactors}/4 · last update {new Date(job.updatedAt).toLocaleString("en-IN")}</div>}
        {error && <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] p-3 text-xs text-rose-200">{error}</div>}
      </div>
    </div>

    {candidate && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="global-fcs-request-title">
      <div className="w-full max-w-lg rounded-2xl border border-cyan-300/20 bg-[#101827] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">Optional evidence workflow</div><h2 id="global-fcs-request-title" className="mt-2 text-2xl font-semibold text-white">Start FCS Review for {candidate.symbol}?</h2></div><button type="button" onClick={() => !submitting && setCandidate(null)} className="rounded-xl border border-white/10 p-2 text-zinc-500 hover:text-white" aria-label="Cancel review request"><X className="h-4 w-4" /></button></div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">The worker will locate dated evidence, validate all four factors, and calculate a score only if the V2 publication contract passes. This usually takes 10–15 minutes. No FCS availability or publishability conclusion has been made yet.</p>
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs text-amber-100"><Clock3 className="mr-2 inline h-4 w-4" />You may leave this page and check the durable status later.</div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={submitting} onClick={() => setCandidate(null)} className="rounded-xl border border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-300 disabled:opacity-50">Cancel</button><button type="button" disabled={submitting} onClick={requestReview} className="rounded-xl border border-cyan-300/35 bg-cyan-300/[0.12] px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-100 disabled:opacity-50">{submitting ? "Submitting…" : "Start FCS Review"}</button></div>
      </div>
    </div>}
  </section>;
}
