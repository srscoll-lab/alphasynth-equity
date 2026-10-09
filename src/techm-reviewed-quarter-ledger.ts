// Transcribed from visually reviewed consolidated INR-million tables. No EBIT/EBITDA substitution.
export const periods:Record<string,any>={
 '2024-12-31':{sha:'b9209e6fd6e5382fe64f443c1c5b3bee4d2e2a338783d7112fd88d5dcb18fc4e',date:'2025-01-17',file:'tml-q3-fy-25-press-release.pdf',page:6,values:[132856,9832,18090,745,199]},
 '2025-03-31':{sha:'f46c47d6945d2072d0cc36cb6db8c96522c7211d3a62be727a815017bc0e16cc',date:'2025-04-24',file:'tml-q4-fy-25-press-release.pdf',page:8,values:[133840,11667,18674,798,150]},
 '2025-06-30':{sha:'2289a04ccf48fa23823fc54e9c6b1b432a99933431dc433416af63902abfd7f3',date:'2025-07-16',file:'tml-q1-fy-26-press-release.pdf',page:6,values:[133512,11406,19352,809,86]},
 '2025-12-31':{sha:'be0cb9ae1535b98482a00e03fbe9098340f46c15d09602235fa3914936566db0',date:'2026-01-16',file:'tml-q3-fy-26-press-release.pdf',page:6,values:[143932,11220,23656,1096,194]},
 '2026-03-31':{sha:'d4ace3677fe45bb1f6b6cfa5c868700027a6c101afda89f5cf223aa1ea07be9f',date:'2026-04-22',file:'tml-q4-fy-26-press-release.pdf',page:6,values:[150761,13538,25653,1073,99]},
 '2026-06-30':{sha:'bb9a48609287b6eb657c931e448a05f31215c875f125fd7492e89c1d5e507607',date:'2026-07-16',file:'tml-q1-fy-27-press-release.pdf',page:7,values:[157119,14651,27425,1078,167]},
};
const definitions=[['earnings','revenue','INR million','Revenue'],['earnings','pat','INR million','Profit after Tax'],['economics','ebitda','INR million','EBITDA'],['execution','deal_tcv','USD million','New deal wins TCV'],['balance_sheet','free_cash_flow','USD million','Free cash flow']];
export function techmReviewedQuarterRows(end:string,cutoff:string,resolveDocument:(url:string,sha:string,date:string)=>any) {
if(!['2025-12-31','2026-03-31','2026-06-30'].includes(end))return [];
const doc=(period:string,metric:string)=>{
 const d=periods[period];const cashPresentation=period==='2026-03-31'&&metric==='free_cash_flow';
 const sha=cashPresentation?'a3e4d811719899298abe0483c5dac86c8f2f7a312f20ee57bec73ee9db2f8bd9':d.sha;
 const url='https://insights.techmahindra.com/investors/'+(cashPresentation?'tml-q4-fy-26-earnings-presentation.pdf':d.file);
 const record=resolveDocument(url,sha,d.date);
 if(!record||record.source_ref!==url||record.document_sha256!==sha||record.source_date!==d.date||d.date>cutoff||!record.archived_document_uri)throw Error('Reviewed Tech Mahindra original/date not matched');
 return record;
};
try {
 const previous=`${Number(end.slice(0,4))-1}${end.slice(4)}`,month=end.slice(5,7),q=({'12':3,'03':4,'06':1} as any)[month],fy=Number(end.slice(0,4))+(month==='03'?0:1);
 return definitions.map(([factor,metric,unit,label],i)=>({symbol:'TECHM',factor,metric_name:metric,unit,
 consolidation_basis:metric==='deal_tcv'?'not_applicable':'consolidated_ind_as',comparison_basis:'same_quarter_prior_year',
 current_period:`Q${q} FY${String(fy).slice(-2)}`,previous_period:`Q${q} FY${String(fy-1).slice(-2)}`,
 current_period_end_date:end,previous_period_end_date:previous,current_value:periods[end].values[i],previous_value:periods[previous].values[i],
 ...doc(end,metric),previous_document:doc(previous,metric),
 source_page:i<3?periods[end].page:(end==='2026-03-31'?(i===4?11:1):1),previous_source_page:i<3?periods[previous].page:1,
 quoted_label:label+(metric==='free_cash_flow'&&end==='2026-03-31'?' (USD Mn), Q4 FY26 column':''),previous_quoted_label:label,
 source_type:'company_filing',confidence:1,extraction_method:'visually_reviewed_official_quarter_table',producer_id:'techm-reviewed-quarter-ledger',extractor_version:'1.0.0'}));
}catch{return [];}
}
