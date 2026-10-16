/** Exact numeric tokens: 13.3 must not match 1.33, 113.3 or rounded 13. */
export function containsReportedNumber(text: string, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const normalized = text.replace(/−/g, "-");
  // Read the entire numeric token before validating grouping. Indian exchange
  // filings use 3,66,820; never match a suffix of that token as a smaller value.
  const tokens = normalized.matchAll(/\(\s*(\d[\d,]*(?:\.\d+)?)\s*%?\s*\)|(?<![\d.,])[-+]?\d[\d,]*(?:\.\d+)?(?![\d.,])/g);
  return [...tokens].some(match => {
    const raw = match[1] ?? match[0];
    if (raw.includes(",") && !/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d+)?$/.test(raw)) return false;
    const number = Number(raw.replaceAll(",", ""));
    return (match[1] !== undefined ? -number : number) === value;
  });
}
export function containsReportingPeriod(text: string, label: string, endDate?: string): boolean {
  const compact = text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (label && compact.includes(label.toLowerCase().replace(/[^a-z0-9]+/g, ""))) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")) return false;
  const [year, month, day] = endDate!.split("-");
  // Exchange result tables use both 30-06-2026 and 30.06.2026. Require
  // complete components so a nearby year/date cannot be accepted by suffix.
  if (new RegExp(`(?<!\\d)0?${Number(day)}(?<separator>[-./])0?${Number(month)}\\k<separator>${year}(?!\\d)`).test(text)) return true;
  const name = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(month) - 1];
  // Issuer quarterly tables commonly print Jun’26 or Jun-26. Accept these
  // explicit month/year headers only for a requested quarter-end date.
  if (/^\d{4}-(03-31|06-30|09-30|12-31)$/.test(endDate!)) {
    const short=name.slice(0,3);
    if(new RegExp(`\\b(?:${name}|${short})\\s*['’‘-]?\\s*(?:${year}|${year.slice(2)})(?!\\d)`,'i').test(text))return true;
  }
  return [endDate!, `${name}${Number(day)}${year}`, `${Number(day)}${name}${year}`]
    .some(variant => compact.includes(variant.toLowerCase().replace(/[^a-z0-9]+/g, "")));
}
