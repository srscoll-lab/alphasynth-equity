/**
 * Owner exception (22 Oct 2026): March-quarter calls often state only full-year
 * figures, so the fourth quarter of an ADDITIVE Execution flow may be derived as
 * full year − (Q1 + Q2 + Q3), each component printed in a company document and
 * verified beside its label. Never for balances (order book, AUM, loan book),
 * percentages or ratios. The result is labelled "derived" and carries its
 * rounding bounds; it is refused when rounding could move the growth rate by
 * more than MAX_GROWTH_UNCERTAINTY_PP or the derived quarter is implausible.
 */
export const ADDITIVE_EXECUTION_METRICS = new Set(["order_inflow", "deal_tcv", "innovative_medicine_sales",
  "aluminium_upstream_shipments_india", "sales_volume", "segment_revenue", "production_volume", "new_loans_booked",
  "disbursements", "product_launch_count"]);
export const MAX_GROWTH_UNCERTAINTY_PP = 0.5;
/** A derived quarter outside 0.5×–2× the average of the first three quarters signals a definition mismatch. */
const PLAUSIBLE_SHARE = [0.5, 2] as const;

export const DERIVATION_METHOD = "full_year_minus_first_three_quarters";

/** A value as printed, converted to the series unit, with the half-width of its last printed digit. */
export type PrintedComponent = { value: number; halfWidth: number; period: string; documentId: string; docId: number; page: number | null; quoted: string };

const SCALE_WORDS: Array<[RegExp, number]> = [[/\blakhs?\b|\blacs?\b/i, 1e5], [/\bcrores?\b|\bcr\b/i, 1e7], [/\bmillions?\b|\bmn\b/i, 1e6], [/\bthousands?\b|'000\b/i, 1e3]];

/**
 * Counted measures are printed as "12.27 lakh motorcycles" or "1.1 million units".
 * Returns the multiplier and the unit wording without the scale word. Money
 * units keep their own scale ("INR crore" is a unit, not a multiplier).
 */
export function countScale(unit: string): { scale: number; rest: string } {
  const raw = String(unit || "").trim();
  if (/\b(?:inr|rs\.?|₹|usd|us\$|\$)/i.test(raw)) return { scale: 1, rest: raw };
  for (const [pattern, scale] of SCALE_WORDS) if (pattern.test(raw)) return { scale, rest: raw.replace(pattern, " ").replace(/\s+/g, " ").trim() };
  return { scale: 1, rest: raw };
}

/** Half of one unit in the last printed decimal place: 12.27 lakh → 0.005 × 100,000 = 500. */
export function printedHalfWidth(printed: number, scale = 1): number {
  const decimals = String(printed).includes(".") ? String(printed).split(".")[1].length : 0;
  return 0.5 * 10 ** -decimals * scale;
}

export type DerivedSide = { value: number; low: number; high: number; method: "printed" | typeof DERIVATION_METHOD; components: PrintedComponent[] };

/** Q4 = FY − (Q1 + Q2 + Q3), with bounds from each component's printed precision. */
export function deriveFourthQuarter(fullYear: PrintedComponent, quarters: PrintedComponent[]): DerivedSide | { reject: string } {
  if (quarters.length !== 3) return { reject: "first_three_quarters_incomplete" };
  const sum = quarters.reduce((total, q) => total + q.value, 0);
  const width = fullYear.halfWidth + quarters.reduce((total, q) => total + q.halfWidth, 0);
  const value = Math.round((fullYear.value - sum) * 1e6) / 1e6;
  if (!(value > 0)) return { reject: "derived_value_not_positive" };
  const average = sum / 3;
  if (value < PLAUSIBLE_SHARE[0] * average || value > PLAUSIBLE_SHARE[1] * average) return { reject: "derived_value_implausible_vs_first_three_quarters" };
  return { value, low: value - width, high: value + width, method: DERIVATION_METHOD, components: [fullYear, ...quarters] };
}

export function printedSide(component: PrintedComponent): DerivedSide {
  return { value: component.value, low: component.value - component.halfWidth, high: component.value + component.halfWidth, method: "printed", components: [component] };
}

/** Largest move in the year-on-year growth rate (percentage points) that rounding alone could cause. */
export function growthUncertaintyPp(current: DerivedSide, previous: DerivedSide): number {
  const growth = (cur: number, prev: number) => (cur / prev - 1) * 100;
  const mid = growth(current.value, previous.value);
  return Math.max(Math.abs(growth(current.low, previous.high) - mid), Math.abs(growth(current.high, previous.low) - mid));
}

export function derivationAcceptable(metric: string, current: DerivedSide, previous: DerivedSide): string | null {
  if (!ADDITIVE_EXECUTION_METRICS.has(metric)) return "metric_not_additive";
  if (current.method === "printed" && previous.method === "printed") return null;
  if (!(previous.low > 0)) return "previous_value_not_positive";
  return growthUncertaintyPp(current, previous) > MAX_GROWTH_UNCERTAINTY_PP ? "rounding_uncertainty_too_large" : null;
}

const format = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Plain-language formula for the report, e.g. "FY26 total 12.27 lakh − (Q1 2,61,326 + Q2 3,27,067 + Q3 3,25,773)". */
export function describeSide(side: DerivedSide, fiscalYear: string): string {
  if (side.method === "printed") return `${format(side.value)} as printed`;
  const [fy, ...qs] = side.components;
  const spread = (side.high - side.low) / 2;
  return `${fiscalYear} total ${fy.quoted} − (${qs.map((q, i) => `Q${i + 1} ${format(q.value)}`).join(" + ")}) = ${format(side.value)}`
    + (spread >= 1 ? ` (±${format(Math.round(spread))} from rounding of the printed total)` : "");
}
