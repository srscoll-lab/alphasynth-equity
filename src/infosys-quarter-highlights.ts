// Narrow issuer adapter. A missing/ambiguous reported highlight fails closed.
// It reads the issuer's quarterly highlights, never annual totals or derived margins.
export function infosysQuarterHighlights(text: string, periodEnd: string): Record<string, number> | null {
  const flat = text.replace(/\s+/g, " ");
  const firstPage = flat.split(/Page 2 of/i)[0];
  const date = new Date(`${periodEnd}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || !/-(03-31|06-30|09-30|12-31)$/.test(periodEnd)) return null;
  const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const datePattern = `${month}\\s+${date.getUTCDate()},?\\s+${date.getUTCFullYear()}`;
  const start = new RegExp(`For the quarter ended\\s+${datePattern}`, "i").exec(firstPage);
  if (!start) return null;
  const quarterText = firstPage.slice(start.index + start[0].length).split(/For (?:the )?(?:year|six|nine|twelve)/i)[0];
  const number = "([\\d,]+(?:\\.\\d+)?)";
  const read = (pattern: string, corpus = quarterText) => {
    const matches = [...corpus.matchAll(new RegExp(pattern, "gi"))].map(match => Number(match[1].replaceAll(",", "")));
    return matches.length && new Set(matches).size === 1 && Number.isFinite(matches[0]) ? matches[0] : null;
  };
  const revenue = read(`(?:Reported IFRS )?revenues (?:at|of|were)\\s*\\$${number}\\s*million`);
  const margin = read(`Reported IFRS operating margin (?:at|of|was at)\\s*${number}\\s*%`)
    ?? read(`(?<!adjusted )operating margin (?:at|of|was at)\\s*${number}\\s*%`);
  const fcf = read(`(?<!adjusted )FCF\\s*(?:at|of|was)\\s*\\$${number}\\s*million`);
  const quarter = ({ 2: 4, 5: 1, 8: 2, 11: 3 } as Record<number, number>)[date.getUTCMonth()];
  let tcv = read(`\\$${number}\\s*Bn\\s*Q${quarter}\\s*Large Deal TCV`, firstPage);
  // Non-year-end releases report one quarterly TCV in their opening paragraph.
  if (tcv === null && quarter !== 4) tcv = read(`TCV of large deal wins (?:was|stood at)\\s*\\$${number}\\s*billion`, firstPage);
  if ([revenue, margin, fcf, tcv].some(value => value === null)) return null;
  if (!/IFRS/i.test(flat) || !/consolidated/i.test(flat)) return null;
  return { revenue: revenue!, operating_margin: margin!, free_cash_flow: fcf!, deal_tcv: tcv! };
}
