import { useEffect, useRef, useState } from "react";
import { Clock3, RefreshCw, X } from "lucide-react";
import { isFundamentalReviewInProgress, type FundamentalReviewJob } from "../fundamental-review-contract";
import { refreshReviewJob, reviewActivityLabel, reviewStatusErrors, startReviewActivityPolling } from "../fundamental-review-activity";
import { useReviewJobs } from "../use-fundamental-review-activity";

type FundamentalReviewActivityProps = {
  onOpenExisting: (symbol: string) => void;
  onReturnToRadar: (symbol: string) => void;
  onDeepDive: (company: { symbol: string; company_name: string; bms_status: "not_requested" }) => void;
};

export default function FundamentalReviewActivity({ onOpenExisting, onReturnToRadar, onDeepDive }: FundamentalReviewActivityProps) {
  const jobs = useReviewJobs();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<FundamentalReviewJob | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const prior = useRef(jobs);
  useEffect(startReviewActivityPolling, []);
  useEffect(() => {
    for (const job of Object.values(jobs)) {
      const old = prior.current[job.symbol];
      if (old && isFundamentalReviewInProgress(old.status) && !isFundamentalReviewInProgress(job.status)) setNotice(job);
    }
    prior.current = jobs;
  }, [jobs]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  const entries = Object.values(jobs).filter((job) => job.status !== "not_started").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const active = entries.filter((job) => isFundamentalReviewInProgress(job.status)).length;
  const ready = entries.filter((job) => job.resultAvailable && !["incomplete", "failed"].includes(job.status)).length;
  return <>
    <button ref={button} type="button" onClick={() => { setOpen(!open); setNotice(null); }} aria-expanded={open} aria-controls="fcs-global-activity" className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/20">
      <Clock3 className="h-4 w-4" /><span className="hidden sm:inline">My FCS reviews</span><span className="sm:hidden">FCS reviews</span><span className="rounded bg-black/25 px-1.5 py-0.5"><span className="hidden sm:inline">{active ? `${active} processing` : ready ? `${ready} ready` : entries.length}</span><span className="sm:hidden">{active || ready || entries.length}</span></span>
    </button>
    {notice && !open && <div role="status" className="fixed right-3 top-24 z-[110] max-w-sm rounded-xl border border-cyan-300/30 bg-[#101827] p-4 text-sm text-white shadow-xl"><button className="float-right ml-2" aria-label="Dismiss review notification" onClick={() => setNotice(null)}><X className="h-4 w-4" /></button><strong>{notice.companyName}</strong><p className="mt-1">{reviewActivityLabel(notice.status)}</p><button onClick={() => { setOpen(true); setNotice(null); }} className="mt-2 text-cyan-200 underline">View review status</button></div>}
    {open && <section ref={panel} tabIndex={-1} id="fcs-global-activity" aria-label="My FCS reviews" className="fixed left-2 right-2 top-20 z-[105] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-cyan-300/25 bg-[#101827] p-4 text-zinc-100 shadow-2xl sm:left-auto sm:w-[30rem]">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">My FCS reviews</h2><button onClick={() => { setOpen(false); button.current?.focus(); }} aria-label="Close FCS reviews"><X className="h-5 w-5" /></button></div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-300">{active} processing · {ready} ready. Status updates every 15 seconds while this app is visible. Requests stay saved in this browser.</p>
      {!entries.length && <p className="mt-5 text-sm text-zinc-300">No requests saved yet. Start an FCS review from the radar or company search. Its progress will appear here on every page.</p>}
      {entries.map((job) => <article key={job.symbol} className="mt-4 border-t border-white/15 pt-4">
        <h3 className="text-sm font-semibold">{job.companyName} <span className="text-zinc-300">({job.symbol})</span></h3>
        <p className={`mt-2 text-sm font-semibold ${job.status === "incomplete" || job.status === "failed" ? "text-amber-200" : job.resultAvailable ? "text-emerald-200" : "text-cyan-100"}`}>{reviewActivityLabel(job.status)}</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-200">{job.message}</p>
        {job.lastLifecycle && job.status !== "ready" && <p className="mt-2 text-xs leading-relaxed text-amber-100">Last completed lifecycle: {job.lastLifecycle.classification} · reporting history ends {job.lastLifecycle.latestPeriodEnd} · calculated {job.lastLifecycle.calculatedAt.slice(0, 10)}. This is not a completed latest-period update.</p>}
        {!isFundamentalReviewInProgress(job.status) && !job.resultAvailable && <p className="mt-1 text-xs text-amber-100">Processing has ended. No new score or lifecycle report was generated by this attempt.</p>}
        <p className="mt-2 text-xs text-zinc-300">Validated factors: {job.completedFactors}/4<br />Requested: {job.requestedAt ? new Date(job.requestedAt).toLocaleString("en-IN") : "Unavailable"}<br />Last worker update: {new Date(job.updatedAt).toLocaleString("en-IN")}</p>
        {reviewStatusErrors[job.symbol] && <p role="alert" className="mt-2 text-xs text-amber-200">{reviewStatusErrors[job.symbol]} The current processing state could not be confirmed.</p>}
        <div className="mt-3 flex flex-wrap gap-3 text-xs"><button onClick={() => void refreshReviewJob(job.symbol)} className="inline-flex items-center gap-1 text-cyan-100 underline"><RefreshCw className="h-3 w-3" />Check latest status</button>
          {job.resultAvailable && !["incomplete", "failed"].includes(job.status) && <button onClick={() => { setOpen(false); onOpenExisting(job.symbol); }} className="font-semibold text-emerald-200 underline">Open FCS report</button>}
          {!isFundamentalReviewInProgress(job.status) && !job.resultAvailable && <>
            <button onClick={() => { setOpen(false); onReturnToRadar(job.symbol); }} className="text-cyan-100 underline">Return to this company in Momentum Radar</button>
            <button onClick={() => { setOpen(false); onDeepDive({ symbol: job.symbol, company_name: job.companyName, bms_status: "not_requested" }); }} className="text-amber-100 underline">Open company Deep Dive</button>
          </>}
        </div>
      </article>)}
    </section>}
  </>;
}
