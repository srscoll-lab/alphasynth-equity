export type LarsenQuarterComparison = { metric: string; previous: number; current: number; page: number; quotedLabel: string };
/** Narrow, fail-closed parser for the issuer's Key Financial Indicators table.
 * Q3/Q4 quarterly columns are left of, and distinct from, cumulative columns.
 * Q1 reverses PDF text order; these two explicit layouts are not interchangeable.
 */
export function larsenQuarterHighlights(text: string, end: string, publishedAt: string): LarsenQuarterComparison[] | null {
  if (!/^\d{4}-(03-31|06-30|12-31)$/.test(end)) return null;
  const year=Number(end.slice(0,4)), month=Number(end.slice(5,7));
  const quarter=({3:4,6:1,12:3} as Record<number,number>)[month];
  const fy=String(month===3?year:year+1).slice(-2), previousFy=String(Number(fy)-1).padStart(2,'0');
  const normalized=text.replace(/\r\n/g,'\n');
  const pages=normalized.split(/\n\s*\n/);
  const tables=pages.flatMap((page,index)=>/Key Financial Indicators/i.test(page)?[{page,index}]:[]);
  if (tables.length!==1 || !/Group Performance/i.test(text)) return null;
  const cover=pages[0].replace(/\s+/g,' ');
  const date=/\b(\d{1,2})\s*(?:st|nd|rd|th)?\s+([A-Z][a-z]+),?\s+(\d{4})\b/.exec(cover);
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (!date || months.indexOf(date[2])<0) return null;
  const coverDate=`${date[3]}-${String(months.indexOf(date[2])+1).padStart(2,'0')}-${date[1].padStart(2,'0')}`;
  if (coverDate!==publishedAt || publishedAt<=end) return null;
  const table=tables[0].page.replace(/\s+/g,' ');
  if (!new RegExp(`Q${quarter}\\s+FY${previousFy}\\s+Q${quarter}\\s+FY${fy}`).test(table)
    || !/(?:Amount in ₹ bn|In ₹ bn)/.test(table)) return null;
  const n='([\\d,]+(?:\\.\\d+)?)';
  const uniquePair=(pattern:string)=>{
    const matches=[...table.matchAll(new RegExp(pattern,'gi'))];
    if(matches.length!==1) return null;
    const values=matches[0].slice(1,3).map(value=>Number(value.replaceAll(',','')));
    return values.every(Number.isFinite)?values:null;
  };
  const prefix=quarter===1;
  const order=uniquePair(prefix?`Order Inflow\\s+${n}\\s+${n}\\s+[-\\d.]+%`:`${n}\\s+${n}\\s+[-\\d.]+%\\s+Order Inflow`);
  const revenue=uniquePair(prefix?`Revenue\\s+${n}\\s+${n}\\s+[-\\d.]+%`:`${n}\\s+${n}\\s+[-\\d.]+%\\s+Revenue`);
  const margin=uniquePair(prefix?`EBITDA\\s*%\\s+${n}%\\s+${n}%`:`${n}%\\s+${n}%\\s+EBITDA\\s*\\(%\\)`);
  const exclusion='\\(exc\\s*l\\s+Financ\\s*ial\\s+Servic\\s*es\\s+business\\)';
  const cfo=uniquePair(prefix?`Cash flow from Operations\\s*${exclusion}\\s+${n}\\s+${n}`:`${n}\\s+${n}\\s+[>\\d.]+%\\s+Cash flow from Operations\\s*${exclusion}`);
  if(!order || !revenue || !margin || !cfo || margin.some(value=>value<0 || value>100)) return null;
  const page=tables[0].index+1;
  return [['revenue',revenue],['ebitda_margin',margin],['order_inflow',order],['operating_cash_flow',cfo]].map(([metric,values])=>({
    metric:metric as string,previous:(values as number[])[0],current:(values as number[])[1],page,
    quotedLabel:`Key Financial Indicators, Q${quarter} FY${previousFy} / Q${quarter} FY${fy}: ${metric}; quarterly columns only${metric==='operating_cash_flow'?'; excludes Financial Services business':''}`,
  }));
}
