import type { FcsLifecycleAssessment } from "../fundamental-review-history";

export default function FcsLifecycleSummary({ value, latestReady }: { value: unknown; latestReady: boolean }) {
  const assessment = value as FcsLifecycleAssessment | null;
  if (!assessment?.classification || !Array.isArray(assessment.checkpoints)) return <p className="mt-3 text-xs text-amber-100">Lifecycle unavailable — three comparable quarterly FCS scores are not yet complete. This does not invalidate the published current FCS.</p>;
  return <section className="mt-4 rounded-xl border border-cyan-300/25 bg-cyan-300/5 p-3">
    <h4 className="text-sm font-semibold text-white">{latestReady ? "Three-period lifecycle" : "Last completed lifecycle — latest update incomplete"}</h4>
    <p className="mt-2 text-sm font-bold text-cyan-100">{assessment.classification.replaceAll("_", " ")}</p>
    <p className="mt-2 text-xs leading-relaxed text-zinc-200">Reporting history ends {assessment.latestPeriodEnd}. Evidence available through {assessment.informationCutoff}. Calculated on {assessment.calculatedAt?.slice(0, 10)}.</p>
    <table className="mt-3 w-full text-left text-xs"><thead><tr className="text-zinc-200"><th className="py-1">Reporting period</th><th>FCS</th><th>Raw score</th></tr></thead>
      <tbody>{assessment.checkpoints.map((checkpoint) => <tr key={checkpoint.periodEnd} className="border-t border-white/10"><td className="py-2 text-white">{checkpoint.periodLabel}<div className="text-zinc-300">Ended {checkpoint.periodEnd}</div></td><td className="text-white">{checkpoint.fcsScore}</td><td className="text-zinc-200">{checkpoint.rawScore.toFixed(4)}</td></tr>)}</tbody>
    </table>
    <p className="mt-2 text-xs text-zinc-200">{assessment.reason.replaceAll("_", " ").toLowerCase()}. Classification describes business changes, not a predicted stock return.</p>
  </section>;
}
