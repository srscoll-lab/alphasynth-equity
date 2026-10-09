const ROOT='https://www.wipro.com/content/dam/nexus/en/investor/corporate-governance/stock-exchange-filing/';
// Exact links observed in the issuer exchange-filing index, not guessed URLs.
export const WIPRO_RELEASES:Record<string,string>={
 '2024-12-31':ROOT+'press-release-17-jan-2025.pdf',
 '2025-03-31':ROOT+'wipro-announces-results-for-the-quarter-and-year-ended-march-31-2025-16-apr-2025.pdf',
 '2025-06-30':ROOT+'wipro-announces-results-for-the-quarter-ended-june-30-2025-17-jul-2025.pdf',
 '2025-12-31':ROOT+'wipro-announces-results-for-the-quarter-ended-december-31-2025-16-jan-2026.pdf',
 '2026-03-31':ROOT+'wipro-announces-results-for-the-quarter-and-year-ended-march-31-2026-16-apr-2026.pdf',
 '2026-06-30':ROOT+'wipro-announces-results-for-the-quarter-ended-june-30-2026-16-jul-2026.pdf',
};
const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
export function wiproCoverDate(text:string,end:string):string|null {
 const expected=`${months[Number(end.slice(5,7))-1]} ${Number(end.slice(8))}, ${end.slice(0,4)}`;
 const normal=text.replace(/\s+/g,' ').replace(/\s+,/g,',');
 if(!normal.includes(expected)||!normal.includes('Wipro'))return null;
 const prefix=normal.split('Highlights of the Results')[0];
 const match=/\b(January|April|July|October)\s+(\d{1,2}),\s*(\d{4})/.exec(prefix);
 if(!match)return null;
 const date=`${match[3]}-${String(months.indexOf(match[1])+1).padStart(2,'0')}-${match[2].padStart(2,'0')}`;
 return date>end?date:null;
}
export function wiproHighlights(text:string,end:string,date:string) {
 if(wiproCoverDate(text,end)!==date)return null;
 const normal=text.replace(/\s+/g,' ').replace(/\s+,/g,',');
 const heading=`Results for the Quarter ended ${months[Number(end.slice(5,7))-1]} ${Number(end.slice(8))}, ${end.slice(0,4)}:`;
 const start=normal.indexOf(heading);if(start<0)return null;
 const part=normal.slice(start+heading.length).split(/Results for the Year|Outlook for the Quarter/)[0];
 const patterns:Record<string,RegExp>={
  revenue:/Gross revenue (?:was )?at\s*₹\s*([\d][\d, ]*\.\d+)\s*billion/i,
  pat:/6\.\s*Net inco\s*me for the quarter (?:was )?(?:at )?₹\s*([\d][\d, ]*\.\d+)\s*billion/i,
  operating_margin:/IT services operating margins?.{0,40}?\s(?:at|was at|was)\s*([\d][\d ]*\.\d+)%/i,
  deal_tcv:/Total bookings\s*\d?\s*(?:was|were)?\s*at\s*\$\s*([\d,]+)\s*million/i,
  operating_cash_flow:/Operating cash flows (?:of|was|were)\s*₹\s*([\d][\d, ]*\.\d+)\s*billion/i,
 };
 const values:Record<string,{value:number;quotedLabel:string}>={};
 for(const [metric,pattern]of Object.entries(patterns)) {
  const matches=[...part.matchAll(new RegExp(pattern.source,pattern.flags+'g'))];if(matches.length!==1)return null;
  values[metric]={value:Number(matches[0][1].replace(/[ ,]/g,'')),quotedLabel:matches[0][0]};
 }
 return values;
}
export const WIPRO_DEFINITIONS=[
 {factor:'earnings',metric:'revenue',unit:'INR billion',basis:'consolidated_ifrs'},
 {factor:'earnings',metric:'pat',unit:'INR billion',basis:'consolidated_ifrs'},
 {factor:'economics',metric:'operating_margin',unit:'percent',basis:'issuer_defined_segment_basis'},
 {factor:'execution',metric:'deal_tcv',unit:'USD million',basis:'not_applicable'},
 {factor:'balance_sheet',metric:'operating_cash_flow',unit:'INR billion',basis:'consolidated_ifrs'},
];
export function wiproQuarterEvidence(input:{end:string;cutoff:string;currentText:string;previousText:string;currentDocument:any;previousDocument:any;requiredDefinitions?:any[]}) {
 const previousEnd=`${Number(input.end.slice(0,4))-1}${input.end.slice(4)}`;
 const current=wiproHighlights(input.currentText,input.end,input.currentDocument.source_date);
 const previous=wiproHighlights(input.previousText,previousEnd,input.previousDocument.source_date);
 if(!current||!previous||input.currentDocument.source_date>input.cutoff||input.previousDocument.source_date>input.cutoff)return [];
 if(input.requiredDefinitions?.length && (input.requiredDefinitions.length!==5 || !WIPRO_DEFINITIONS.every(d=>input.requiredDefinitions!.some(r=>r.factor===d.factor&&r.metric===d.metric&&r.unit===d.unit&&r.consolidation_basis===d.basis&&r.comparison_basis==='same_quarter_prior_year'))))return [];
 const year=Number(input.end.slice(0,4)),month=Number(input.end.slice(5,7)),quarter=({3:4,6:1,9:2,12:3}as Record<number,number>)[month],fy=month===3?year:year+1;
 return WIPRO_DEFINITIONS.map(d=>({symbol:'WIPRO',factor:d.factor,metric_name:d.metric,unit:d.unit,
  consolidation_basis:d.basis,comparison_basis:'same_quarter_prior_year',current_period:`Q${quarter} FY${String(fy).slice(-2)}`,previous_period:`Q${quarter} FY${String(fy-1).slice(-2)}`,
  current_period_end_date:input.end,previous_period_end_date:previousEnd,current_value:current[d.metric].value,previous_value:previous[d.metric].value,
  ...input.currentDocument,previous_document:input.previousDocument,source_page:2,previous_source_page:2,
  quoted_label:current[d.metric].quotedLabel,previous_quoted_label:previous[d.metric].quotedLabel,
  source_type:'company_filing',confidence:1,extraction_method:'deterministic_wipro_quarter_highlights',extractor_version:'1.0.0',producer_id:'wipro-official-quarter-parser'}));
}
