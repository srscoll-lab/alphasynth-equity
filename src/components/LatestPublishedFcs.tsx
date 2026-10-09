import { useEffect, useState } from 'react';
import FcsLifecycleSummary from './FcsLifecycleSummary';
import { normalizeFundamentalReviewJob } from '../fundamental-review-contract';
import { trackReviewJob } from '../fundamental-review-activity';

/** Read-only publication lookup. Opening a company never launches paid research. */
export default function LatestPublishedFcs({ symbol, companyName,hasEarlierSnapshot=true }: {symbol:string; companyName:string;hasEarlierSnapshot?:boolean}) {
  const [payload,setPayload] = useState<any>(null);
  const [lookupFailed,setLookupFailed] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    setPayload(null);
    setLookupFailed(false);
    setLoading(true);
    const controller = new AbortController();
    fetch(`/api/bms/fundamental-review/result/${encodeURIComponent(symbol)}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{
        if (response.status === 404 || response.status === 409) return null;
        if (!response.ok) throw new Error('Publication lookup unavailable');
        return response.json();
      })
      .then(value=>{
        if (controller.signal.aborted || value?.result?.score_publishable !== true
          || !value.result.current_period?.end_date || !value.result.checkpoints?.some((item:any)=>item.periodEnd===value.result.current_period.end_date && item.completeFactors===4)) return;
        setPayload(value);
        trackReviewJob(normalizeFundamentalReviewJob(value.job,{symbol,companyName}));
      }).catch(()=>{if (!controller.signal.aborted) setLookupFailed(true);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[symbol,companyName,attempt]);
  if (!payload) return lookupFailed||(!loading&&!hasEarlierSnapshot) ? <div className="mb-5 rounded-xl border border-amber-300/25 p-3 text-sm text-amber-100">Could not load the published review.{hasEarlierSnapshot?' The earlier report remains available below.':''} <button className="ml-2 underline" onClick={()=>setAttempt(value=>value+1)}>Retry report lookup</button></div> : !hasEarlierSnapshot?<p role="status" className="mb-5 text-cyan-100">Loading the published FCS report…</p>:null;
  const score=payload.result;
  const reportCompanyName=String(payload.job?.companyName||companyName);
  const references = (score.checkpoints || []).flatMap((checkpoint:any)=>checkpoint.documentReferences || []);
  return <section aria-label={`${reportCompanyName} latest processed FCS`} className="mb-6 rounded-2xl border border-cyan-300/30 bg-cyan-300/5 p-5">
    <h2 className="text-xl font-semibold text-white">{reportCompanyName} — latest processed FCS</h2>
    <p className="mt-2 text-sm text-zinc-200">Reporting period: {score.current_period?.label || 'See factor periods below'}{score.current_period?.end_date ? ` · ended ${score.current_period.end_date}` : ''}. Information cutoff: {payload.informationCutoff}. Calculated: {String(score.calculated_at || payload.job?.updatedAt || '').slice(0,10)}.</p>
    <p className="mt-3 text-3xl font-bold text-emerald-200">FCS {score.fcs_score}</p>
    <FcsLifecycleSummary value={score.lifecycle_assessment} latestReady={score.lifecycle_ready === true}/>
    <details className="mt-4 text-sm text-zinc-200"><summary className="cursor-pointer text-cyan-100">View four-factor scoring details</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">{(score.factors || []).map((factor:any)=><article key={factor.factor_id} className="rounded-lg border border-white/15 p-3"><h3 className="font-semibold text-white">{reportCompanyName} — {factor.factor_id.replaceAll('_',' ')}</h3>{(factor.impacts || []).map((impact:any)=>{
        const source = references.find((document:any)=>document.documentId === impact.current_document_id);
        const previousSource=references.find((document:any)=>document.documentId===impact.previous_document_id);
        return <div key={impact.metric_id} className="mt-2 text-xs leading-relaxed"><p>{impact.metric_id.replaceAll('_',' ')} · {impact.direction || 'See score'} · CSS {impact.css_score ?? '—'}</p><p className="mt-1 text-white">{impact.previous_period?.label}: {impact.previous_value ?? 'Not included'} → {impact.current_period?.label}: {impact.current_value ?? 'Not included'} {impact.canonical_unit}</p><p className="mt-1 text-zinc-200">{impact.current_source_locator?.quoted_label || ''}</p>{source?.sourceUrl?.startsWith('https://') && <a className="mt-1 inline-block text-cyan-100 underline" href={source.sourceUrl} target="_blank" rel="noopener noreferrer">Open official source{impact.current_source_locator?.page ? ` (page ${impact.current_source_locator.page})` : ''}</a>}{previousSource?.sourceUrl?.startsWith('https://') && previousSource.documentId!==source?.documentId && <a className="ml-3 mt-1 inline-block text-cyan-100 underline" href={previousSource.sourceUrl} target="_blank" rel="noopener noreferrer">Previous-period source{impact.previous_source_locator?.page ? ` (page ${impact.previous_source_locator.page})` : ''}</a>}<p className="mt-1 break-all text-zinc-300">Evidence: {impact.current_document_id || impact.document_id || 'Source identity recorded in the review ledger'}.</p></div>;
      })}</article>)}</div>
    </details>
    <p className="mt-4 text-xs text-zinc-200">{hasEarlierSnapshot?'The earlier published snapshot remains below for reference. ':''}This current assessment does not replace the frozen forward-validation labels.</p>
    <p className="mt-2 text-xs text-zinc-200">The three quarters above use the same metric definitions. Older snapshots may contain a different metric set; compare their dates and definitions before interpreting a difference between report totals.</p>
  </section>;
}
