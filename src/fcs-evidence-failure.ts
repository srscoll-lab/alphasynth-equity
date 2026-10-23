/** User-facing terminal explanations; technical URLs/errors stay in the private ledger. */
export const DATA_PROVIDER_DAILY_LIMIT='DATA_PROVIDER_DAILY_LIMIT';
export const DAILY_LIMIT_MESSAGE='AlphaSynth’s free data plan has reached its daily limit. Please request this review again after midnight IST (00:00). No FCS was generated; this says nothing about the company.';
/** Tapetide's Free plan resets at 00:00 IST (18:30 UTC). */
export function nextIstMidnight(now:number):number { const ist=5.5*3_600_000,day=86_400_000; return Math.floor((now+ist)/day)*day+day-ist; }
export function fcsDailyLimitReached(diagnostics:any[]):boolean { return diagnostics.some(d=>d?.outcome==='tapetide_quota_exhausted'); }
export function fcsEvidenceFailureMessage(factors:number,diagnostics:any[]):string {
 const outcomes=new Set(diagnostics.map(d=>d?.outcome));
 if(outcomes.has('tapetide_quota_exhausted'))return `Review paused: ${DAILY_LIMIT_MESSAGE}`;
 const summary=diagnostics.find(d=>d?.outcome==='official_document_retrieval_summary');
 let reason='We could not verify enough comparable financial evidence.';
 if(outcomes.has('empty_pdf_text'))reason='Some reports could not be read as text and require further document extraction.';
 else if(summary?.retrieved_document_count===0)reason='We could not retrieve readable reports from verified official sources.';
 else if(outcomes.has('model_returned_no_verified_factor_comparison'))reason='Reports were retrieved, but we could not extract verified financial comparisons.';
 else if(outcomes.has('publication_date_not_supported_by_document_header')||outcomes.has('previous_publication_date_not_supported_by_document_header'))reason='The publication dates needed to verify the financial comparisons could not be established.';
 return `Review finished: ${factors} of 4 factors verified. ${reason} No FCS report was generated. This does not mean the company is unsuitable for analysis.`;
}
