import {hclCoverDate} from './hcl-quarter-index.ts';
type Value={value:number;page:number;quotedLabel:string};
export function hclQuarterHighlights(text:string,end:string,publishedAt:string):Record<string,Value>|null {
 const pages=text.replace(/\r\n/g,'\n').split(/\n\s*\n/);
 if(hclCoverDate(pages.slice(0,2).join(' '),end)!==publishedAt)return null;
 const year=Number(end.slice(0,4)),month=Number(end.slice(5,7)),quarter=({3:4,6:1,9:2,12:3} as Record<number,number>)[month];
 const fy=month===3?year:year+1;
 const shortDate=`${end.slice(8)}-${({3:'Mar',6:'Jun',9:'Sep',12:'Dec'} as Record<number,string>)[month]}-${String(year).slice(-2)}`;
 const income=pages.flatMap((page,index)=>new RegExp(`Financials in \\$ for the Quarter ended ${shortDate} \\(IFRS\\)`,'i').test(page)?[{text:page.replace(/\s+/g,' '),page:index+1}]:[]);
 if(income.length!==1 || !/Consolidated Income Statement/.test(income[0].text))return null;
 const n='([\\d,]+(?:\\.\\d+)?)';
 const revenue=new RegExp(`Revenues\\s+${n}\\s+${n}\\s+${n}\\s+100\\.0%`).exec(income[0].text);
 const margin=new RegExp(`\\bEBIT\\s+${n}\\s+${n}\\s+${n}\\s+${n}%\\*?\\s+${n}%\\*?\\s+${n}%`).exec(income[0].text);
 const highlights=pages.flatMap((page,index)=>new RegExp(`^Q${quarter}\\s*(?:& Annual )?FY\\s*(?:${fy}|${String(fy).slice(-2)})\\s+(?:Highlights|Performance)`,'i').test(page.trim())?[{text:page.replace(/\s+/g,' '),page:index+1}]:[]);
 if(highlights.length!==1)return null;
 const bookings=new RegExp(`(?:TCV \\(New Deal wins\\) at|Bookings \\(New Deal Wins\\))\\s*\\$${n}\\s*M`,'i').exec(highlights[0].text);
 const cash=pages.flatMap((page,index)=>/Consolidated Cash Flow Summary & Cash Position/.test(page)?[{text:page.replace(/\s+/g,' '),page:index+1}]:[]);
 if(cash.length!==1)return null;
 const netCash=new RegExp(`\\bNet Cash\\s+${n}\\s+${n}\\s+${n}\\s+${n}\\s*(?:Excludes the one-time impact|About HCLTech|$)`).exec(cash[0].text);
 if(!revenue || !margin || !bookings || !netCash)return null;
 const number=(value:string)=>Number(value.replaceAll(',',''));
 const result={
   revenue:{value:number(revenue[3]),page:income[0].page,quotedLabel:`Consolidated IFRS income statement, quarter ${shortDate}, Revenues, USD million`},
   operating_margin:{value:number(margin[6]),page:income[0].page,quotedLabel:`Consolidated IFRS quarterly EBIT margin, ${shortDate}; excluding one-time New Labour Codes impact where reported; restructuring costs remain included`},
   deal_tcv:{value:number(bookings[1]),page:highlights[0].page,quotedLabel:`Q${quarter} FY${String(fy).slice(-2)} quarterly new deal wins TCV, USD million; not annual bookings`},
   net_cash:{value:number(netCash[2]),page:cash[0].page,quotedLabel:`Consolidated net cash at ${end}, INR crore; second INR column, not gross cash or cash-flow totals`},
 };
 return Object.values(result).every(item=>Number.isFinite(item.value))?result:null;
}
