import {hclQuarterHighlights} from './hcl-quarter-highlights.ts';
export const HCL_METRIC_DEFINITIONS=[
 {factor:'earnings',metric:'revenue',unit:'USD million',basis:'consolidated_ifrs',comparison:'same_quarter_prior_year'},
 {factor:'economics',metric:'operating_margin',unit:'percent',basis:'consolidated_ifrs_excluding_exceptional_items',comparison:'same_quarter_prior_year'},
 {factor:'execution',metric:'deal_tcv',unit:'USD million',basis:'not_applicable',comparison:'same_quarter_prior_year'},
 {factor:'balance_sheet',metric:'net_cash',unit:'INR crore',basis:'consolidated_ifrs',comparison:'point_in_time_prior_period'},
];
export function hclQuarterEvidence(input:{end:string;cutoff:string;currentText:string;previousText:string;currentDocument:Record<string,any>;previousDocument:Record<string,any>;requiredDefinitions?:any[]}) {
 const previousEnd=`${Number(input.end.slice(0,4))-1}${input.end.slice(4)}`;
 const current=hclQuarterHighlights(input.currentText,input.end,input.currentDocument.source_date);
 const previous=hclQuarterHighlights(input.previousText,previousEnd,input.previousDocument.source_date);
 if(!current || !previous)return [];
 const required=input.requiredDefinitions || [];
 if(required.length && !HCL_METRIC_DEFINITIONS.every(definition=>required.some(item=>item.factor===definition.factor && item.metric===definition.metric && item.unit===definition.unit && item.consolidation_basis===definition.basis && item.comparison_basis===definition.comparison)))return [];
 const year=Number(input.end.slice(0,4)),month=Number(input.end.slice(5,7)),quarter=({3:4,6:1,9:2,12:3} as Record<number,number>)[month],fy=month===3?year:year+1;
 return HCL_METRIC_DEFINITIONS.map(definition=>({symbol:'HCLTECH',factor:definition.factor,metric_name:definition.metric,
   previous_period:`Q${quarter} FY${String(fy-1).slice(-2)}`,current_period:`Q${quarter} FY${String(fy).slice(-2)}`,
   previous_period_end_date:previousEnd,current_period_end_date:input.end,
   previous_value:previous[definition.metric].value,current_value:current[definition.metric].value,
   unit:definition.unit,comparison_basis:definition.comparison,consolidation_basis:definition.basis,
   ...input.currentDocument,previous_document:input.previousDocument,
   quoted_label:current[definition.metric].quotedLabel,previous_quoted_label:previous[definition.metric].quotedLabel,
   source_page:current[definition.metric].page,previous_source_page:previous[definition.metric].page,
   source_type:'company_filing',cutoff_date:input.cutoff,confidence:1,
   extraction_method:'deterministic_hcl_quarter_tables',extractor_version:'1.0.0',producer_id:'hcl-official-quarter-parser'}));
}
