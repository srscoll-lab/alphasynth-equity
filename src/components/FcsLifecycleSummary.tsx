import type { FcsLifecycleAssessment } from "../fundamental-review-history";
import { lifecycleDisplay } from "../lifecycle-copy";
import { lifecyclePendingExplanation } from "../fcs-lifecycle-pending";

export default function FcsLifecycleSummary({ value, latestReady, unavailableReason, periodGaps }:
  { value: unknown; latestReady: boolean; unavailableReason?: unknown; periodGaps?: unknown }) {
  const assessment = value as FcsLifecycleAssessment | null;
  const pending = latestReady ? [] : lifecyclePendingExplanation(unavailableReason, periodGaps);
  if (!assessment?.classification || !Array.isArray(assessment.checkpoints)) return pending.length
    ? <div role="note" className="mt-3 space-y-1 rounded-lg border border-amber-300/30 bg-amber-300/5 p-3 text-xs text-amber-100">{pending.map((line) => <p key={line}>{line}</p>)}</div>
    : <p className="mt-3 text-xs text-amber-100">Lifecycle unavailable — three comparable quarterly FCS scores are not yet complete. This does not invalidate the published current FCS.</p>;
  return <section className="mt-4 rounded-xl border border-cyan-300/25 bg-cyan-300/5 p-3">
    <h4 className="text-sm font-semibold text-white">{latestReady ? "Three-period lifecycle" : "Last completed lifecycle — latest update incomplete"}</h4>
    {pending.length > 0 && <div role="note" className="mt-2 space-y-1 text-xs text-amber-100">{pending.map((line) => <p key={line}>{line}</p>)}</div>}
    <p className="mt-2 text-sm font-bold text-cyan-100">{lifecycleDisplay(assessment.classification).label}</p>
    <p className="mt-1 text-xs text-zinc-200">{lifecycleDisplay(assessment.classification).explanation}</p>
    <p className="mt-2 text-xs leading-relaxed text-zinc-200">Reporting history ends {assessment.latestPeriodEnd}. Evidence available through {assessment.informationCutoff}. Calculated on {assessment.calculatedAt?.slice(0, 10)}.</p>
    <table className="mt-3 w-full text-left text-xs"><thead><tr className="text-zinc-200"><th className="py-1">Reporting period</th><th>FCS</th><th>Raw score</th></tr></thead>
      <tbody>{assessment.checkpoints.map((checkpoint) => <tr key={checkpoint.periodEnd} className="border-t border-white/10"><td className="py-2 text-white">{checkpoint.periodLabel}<div className="text-zinc-300">Ended {checkpoint.periodEnd}</div></td><td className="text-white">{checkpoint.fcsScore}</td><td className="text-zinc-200">{checkpoint.rawScore.toFixed(4)}</td></tr>)}</tbody>
    </table>
    <p className="mt-2 text-xs text-zinc-200">{assessment.reason.replaceAll("_", " ").toLowerCase()}. Classification describes business changes, not a predicted stock return.</p>
  </section>;
}
