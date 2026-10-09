/** A model's date is not provenance: require its literal date in the document header.
 * Reporting-period end dates cannot establish a later release/filing date.
 */
export function publicationDateSupported(text:string,date:string,periodEnd:string):boolean {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<=periodEnd)return false;
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const [y,m,d]=date.split('-'),month=months[Number(m)-1];if(!month)return false;
 const parsed=new Date(date+'T00:00:00Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return false;
 const day=`0?${Number(d)}(?:st|nd|rd|th)?`,name=`(?:${month}|${month.slice(0,3)}\\.?)`;
 const header=text.slice(0,5000).replace(/(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}[0-9:.+Z-]*/g,'$1 ').replace(/\s+/g,' ');
 return new RegExp(`\\b(?:${name}\\s+${day}\\s*,?\\s*${y}|${day}\\s+${name}\\s*,?\\s*${y}|${y}[-/]${m}[-/]${d}|${d}[-/]${m}[-/]${y})\\b`,'i').test(header);
}
