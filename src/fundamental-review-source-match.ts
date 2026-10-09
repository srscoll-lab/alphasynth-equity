/** Exact numeric tokens: 13.3 must not match 1.33, 113.3 or rounded 13. */
export function containsReportedNumber(text: string, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const normalized = text.replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "").replace(/−/g, "-");
  return [...normalized.matchAll(/\(\s*(\d+(?:\.\d+)?)\s*%?\s*\)|(?<![\d.])[-+]?\d+(?:\.\d+)?(?![\d.])/g)]
    .some(match => (match[1] !== undefined ? -Number(match[1]) : Number(match[0])) === value);
}
export function containsReportingPeriod(text: string, label: string, endDate?: string): boolean {
  const compact = text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (label && compact.includes(label.toLowerCase().replace(/[^a-z0-9]+/g, ""))) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")) return false;
  const [year, month, day] = endDate!.split("-");
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
