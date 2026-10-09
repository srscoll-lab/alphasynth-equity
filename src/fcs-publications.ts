export type FcsPublicationSummary={symbol:string;companyName:string;fcsScore:number;fcsPeriod:string;informationCutoff:string;calculatedAt:string;lifecycleReady:boolean;lifecycle:string|null;historyThrough:string|null;checkpoints:number};
/** Public summaries expose no candidate ledger, private diagnostics or job credentials. */
export function fcsPublicationSummaries(records:any[],cutoff:string):FcsPublicationSummary[] {
 return records.flatMap(record=>{
  const score=record.scoreResult;
 if(!['ready','score_ready_lifecycle_pending'].includes(record.status) || record.completedFactors!==4 || score?.score_publishable!==true || !record.resultAvailable
    || !Number.isFinite(score.fcs_score) || score.fcs_score<0 || score.fcs_score>100
    || !/^\d{4}-\d{2}-\d{2}$/.test(record.informationCutoff) || record.informationCutoff>cutoff
    || !/^[A-Z0-9&.-]{1,24}$/.test(record.symbol)
    || !/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(score.current_period?.end_date || '')
    || !Array.isArray(score.checkpoints) || !score.checkpoints.some((item:any)=>item.periodEnd===score.current_period.end_date && item.completeFactors===4))return [];
  const assessment=score.lifecycle_assessment;
  const lifecycleReady=score.lifecycle_ready===true && !!assessment?.classification && assessment.latestPeriodEnd===score.current_period?.end_date
    && Array.isArray(assessment.checkpoints) && assessment.checkpoints.length===3;
  return [{symbol:record.symbol,companyName:record.companyName,fcsScore:score.fcs_score,
    fcsPeriod:String(score.current_period?.label || 'See factor reporting periods'),informationCutoff:record.informationCutoff,
    calculatedAt:String(score.calculated_at || record.updatedAt),lifecycleReady,
    lifecycle:lifecycleReady?assessment.classification:null,historyThrough:lifecycleReady?assessment.latestPeriodEnd:null,
    checkpoints:Array.isArray(score.checkpoints)?score.checkpoints.length:0}];
 });
}

/** Update the current research library only, never a frozen validation dataset.
 * Unknown symbols are not silently added to the static qualified library.
 */
export function mergeFcsPublications<T extends {symbol:string;fcsAsOf:string;fcsScore:number;fcsPeriod:string;lifecycle:string|null;lifecycleReady:boolean;checkpoints:number}>(base:T[],publications:FcsPublicationSummary[],admitNew?:(publication:FcsPublicationSummary)=>T|null) {
 const merged=base.map(record=>{
  const publication=publications.find(item=>item.symbol===record.symbol && item.checkpoints>=1 && /^Q[1-4]\s+FY/.test(item.fcsPeriod)
    && item.informationCutoff>=record.fcsAsOf.slice(0,10));
  if(!publication)return record;
  return {...record,fcsScore:publication.fcsScore,fcsPeriod:publication.fcsPeriod,fcsAsOf:publication.informationCutoff,
    lifecycle:publication.lifecycleReady?publication.lifecycle:record.lifecycle,
    lifecycleReady:publication.lifecycleReady || record.lifecycleReady,
    checkpoints:publication.lifecycleReady?3:record.lifecycleReady?record.checkpoints:publication.checkpoints,
    lifecycleAsOf:publication.lifecycleReady?publication.historyThrough:null,
    livePublication:true};
 });
 if(admitNew)for(const publication of publications){
  if(merged.some(record=>record.symbol===publication.symbol)||! /^[A-Z0-9&.-]{1,24}$/.test(publication.symbol)
   ||!Number.isFinite(publication.fcsScore)||publication.fcsScore<0||publication.fcsScore>100
   ||publication.checkpoints<1||! /^Q[1-4]\s+FY\d{2,4}$/.test(publication.fcsPeriod)
   ||! /^\d{4}-\d{2}-\d{2}$/.test(publication.informationCutoff))continue;
  const record=admitNew(publication);if(record&&record.symbol===publication.symbol)merged.push(record);
 }
 return merged;
}
