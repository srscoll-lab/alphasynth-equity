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
// Words that cannot identify a row by themselves; "Total" must not let a
// totals row stand in for a segment row.
const GENERIC_LABEL_WORDS = new Set(["total", "others", "other", "net", "gross", "sales", "income", "revenue",
  "profit", "loss", "amount", "value", "values", "particulars", "quarter", "quarterly", "ended", "year", "half",
  "rs", "inr", "cr", "crore", "crores", "lakh", "lakhs", "million", "mn", "in", "of", "the", "and", "for", "from",
  "operations", "on", "as", "at", "to", "result", "results", "statement", "consolidated", "standalone"]);

/**
 * The issuer's own row label quoted by the extractor (e.g. "Domestic
 * Explosives" for segment revenue). Callers still require both values and
 * both periods beside this label in the original document; this only widens
 * which row label may be searched. Numbers are stripped, and labels made only
 * of generic words are refused.
 */
export function sourceLabelVariants(quoted: unknown): string[] {
  const label = String(quoted || "").toLowerCase()
    .replace(/[₹%()]/g, " ")
    .split(/\s+/).filter((token) => token && !/\d/.test(token)).join(" ")
    .replace(/^[^a-z]+|[^a-z]+$/g, "").replace(/\s+/g, " ").trim();
  const words = label.split(/[^a-z]+/).filter(Boolean);
  if (label.length > 80 || !words.length || words.every((word) => GENERIC_LABEL_WORDS.has(word))) return [];
  // One-word segment names ("Defence") are allowed only when distinctive;
  // short tokens such as "CIL" or "Q4" could match unrelated rows.
  if (words.length === 1) return words[0].length >= 5 ? [label] : [];
  return label.length >= 6 ? [label] : [];
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
