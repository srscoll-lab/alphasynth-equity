/**
 * Owner decision (21 Oct 2026) for a three-quarter series: Execution must be
 * like-for-like. Use the order book when every quarter reports it; otherwise
 * keep only the Execution measures present in every quarter. A measure's
 * identity is its metric and, for segment revenue, the segment. Issuers word
 * the same segment differently across calls ("India" / "Sales for the
 * formulation business in India"), so segments match on their meaningful
 * words. Kept rows are relabelled to one canonical name so the quarters'
 * signatures agree. With no common measure nothing is forced.
 */
export type QuarterEvidence = { periodEnd: string; candidates: any[]; validations: any[]; documents: any[] };
export type AlignmentResult = {
  aligned: boolean;
  measure?: string;
  segments: string[];
  quarters: QuarterEvidence[];
  reason?: string;
  segmentsByQuarter?: Record<string, string[]>;
};

const FILLER = new Set(["sales", "sale", "revenue", "revenues", "business", "businesses", "operations", "operation", "segment",
  "segments", "from", "for", "the", "in", "of", "and", "our", "its", "total", "company", "share", "net", "income", "growth",
  "quarter", "q1", "q2", "q3", "q4", "fy", "first", "second", "third", "fourth"]);

/** Meaningful words of a segment label (possessives and filler removed). */
export function segmentTokens(label: string): string[] {
  return [...new Set(String(label || "").toLowerCase().replace(/[’']s\b/g, "").split(/[^a-z]+/)
    .filter((word) => word.length > 1 && !FILLER.has(word) && !/^fy\d*$/.test(word)))];
}
const subsetOf = (a: string[], b: string[]) => a.length > 0 && a.every((word) => b.includes(word));
/** Same segment when one label's meaningful words are contained in the other's. */
export function sameSegment(a: string, b: string): boolean {
  const ta = segmentTokens(a), tb = segmentTokens(b);
  return subsetOf(ta, tb) || subsetOf(tb, ta);
}

/** One spelling per unit so quarters compare (values are unchanged). */
export function canonicalUnitSpelling(unit: string): string {
  return ({ "Rs.Cr": "INR crore", "Rs.Bn": "INR billion", "USD.Mn": "USD million", "USD.Bn": "USD billion", vehicles: "units" } as Record<string, string>)[unit] ?? unit;
}

const rawLabel = (candidate: any) => String(candidate?.source_metric_label || candidate?.current_source_locator?.quoted_label || "").split(" — ")[0].trim();
const execution = (quarter: QuarterEvidence) => quarter.candidates.filter((candidate) => candidate.factor_id === "execution");

/**
 * Same business across quarters by size: when the latest quarter has one row of a
 * (non-segment, non-percentage) metric, an earlier quarter keeps only its row closest
 * in size, within 0.5–2×. Eicher (23 Oct): "quarter sales" 332,940 motorcycles; the
 * earlier calls also give VECV truck volumes (~25,000) under generic labels.
 */
const SIZE_BAND = [0.5, 2] as const;
export function rowsOutOfSeries(quarters: QuarterEvidence[]): Set<string> {
  const excluded = new Set<string>();
  const latest = [...quarters].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd)).at(-1);
  if (!latest) return excluded;
  const sized = (c: any) => c.canonical_metric_id !== "segment_revenue" && c.canonical_metric_id !== "order_book"
    && !/percent|basis points/i.test(String(c.canonical_unit)) && Number(c.current_canonical_value) > 0;
  const inBand = (rows: any[], size: number) => rows.filter((c) => { const ratio = Number(c.current_canonical_value) / size; return ratio >= SIZE_BAND[0] && ratio <= SIZE_BAND[1]; })
    .sort((a, b) => Math.abs(Math.log(Number(a.current_canonical_value) / size)) - Math.abs(Math.log(Number(b.current_canonical_value) / size)));
  for (const metric of new Set(execution(latest).filter(sized).map((c) => String(c.canonical_metric_id)))) {
    const latestRows = execution(latest).filter((c) => c.canonical_metric_id === metric && sized(c));
    const earlierRows = (quarter: QuarterEvidence) => execution(quarter).filter((c) => c.canonical_metric_id === metric && sized(c));
    // Several current rows (Eicher, 26 Oct: Royal Enfield and VECV): keep the one whose size continues
    // in every earlier quarter, the largest (the main business) if more than one does.
    const continuing = latestRows.filter((c) => quarters.every((q) => q === latest || inBand(earlierRows(q), Number(c.current_canonical_value)).length > 0))
      .sort((a, b) => Number(b.current_canonical_value) - Number(a.current_canonical_value));
    const reference = latestRows.length === 1 ? latestRows[0] : continuing[0];
    if (!reference) continue;
    for (const row of latestRows) if (row !== reference) excluded.add(row.candidate_id);
    const size = Number(reference.current_canonical_value);
    for (const quarter of quarters) {
      if (quarter === latest) continue;
      const best = inBand(earlierRows(quarter), size)[0];
      for (const row of earlierRows(quarter)) if (row !== best) excluded.add(row.candidate_id);
    }
  }
  return excluded;
}

export function alignExecutionAcrossQuarters(quarters: QuarterEvidence[]): AlignmentResult {
  const everyHasOrderBook = quarters.every((q) => execution(q).some((c) => c.canonical_metric_id === "order_book"));
  const outOfSeries = rowsOutOfSeries(quarters);
  const rows = (q: QuarterEvidence) => execution(q).filter((c) => !outOfSeries.has(c.candidate_id));
  // Groups of matching measures across quarters.
  type Group = { metric: string; label: string; tokens: string[]; perQuarter: Map<string, any[]> };
  const groups: Group[] = [];
  // A metric reported more than once in a quarter (e.g. India and International
  // volume growth) is told apart by its label, like segment revenue.
  const multiRow = new Set(quarters.flatMap((q) => {
    const counts = new Map<string, number>();
    for (const c of rows(q)) counts.set(c.canonical_metric_id, (counts.get(c.canonical_metric_id) || 0) + 1);
    return [...counts].filter(([, n]) => n > 1).map(([metric]) => metric);
  }));
  for (const quarter of quarters) {
    for (const candidate of rows(quarter)) {
      const metric = String(candidate.canonical_metric_id);
      if (everyHasOrderBook && metric !== "order_book") continue;
      const label = rawLabel(candidate);
      const named = metric === "segment_revenue" || multiRow.has(metric);
      if (named && !segmentTokens(label).length) continue;
      let group = groups.find((g) => g.metric === metric && (!named || sameSegment(g.label, label)));
      if (!group) groups.push(group = { metric, label, tokens: segmentTokens(label), perQuarter: new Map() });
      if (named && label.length < group.label.length) group.label = label;   // shortest wording is canonical
      group.perQuarter.set(quarter.periodEnd, [...(group.perQuarter.get(quarter.periodEnd) || []), candidate]);
    }
  }
  // The same measure twice in one quarter (Thermax, 24 Oct: order book against a year ago AND
  // against last quarter): keep the year-on-year comparison, else the longest one, in every quarter.
  const yearBefore = (end: string) => `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`;
  for (const group of groups) for (const [periodEnd, rows] of group.perQuarter) {
    if (rows.length < 2) continue;
    const previousEnd = (c: any) => String(c.previous_period?.end_date || "");
    const yoy = rows.filter((c) => previousEnd(c) === yearBefore(String(c.current_period?.end_date || periodEnd)));
    group.perQuarter.set(periodEnd, yoy.length === 1 ? yoy : [[...rows].sort((a, b) => previousEnd(a).localeCompare(previousEnd(b)))[0]]);
  }
  const common = groups.filter((group) => quarters.every((quarter) => (group.perQuarter.get(quarter.periodEnd) || []).length === 1));
  if (!common.length) {
    return { aligned: false, segments: [], quarters: [], reason: "no_common_execution_measure", segmentsByQuarter: Object.fromEntries(quarters.map((quarter) =>
      [quarter.periodEnd, execution(quarter).map((c) => `${c.canonical_metric_id}:${rawLabel(c)}`)])) };
  }
  const keep = new Map<string, { canonical: string; named: boolean }>();
  for (const group of common) for (const rows of group.perQuarter.values()) for (const row of rows)
    keep.set(row.candidate_id, { canonical: group.label, named: group.metric === "segment_revenue" || multiRow.has(group.metric) });
  return {
    aligned: true,
    measure: everyHasOrderBook ? "order_book" : [...new Set(common.map((group) => group.metric))].join("+"),
    segments: common.filter((group) => group.metric === "segment_revenue").map((group) => group.label),
    quarters: quarters.map((quarter) => {
      const dropped = new Set(execution(quarter).filter((c) => !keep.has(c.candidate_id)).map((c) => c.candidate_id));
      return { ...quarter,
        validations: quarter.validations.filter((v) => !dropped.has(v.candidate_id)),
        candidates: quarter.candidates.filter((c) => !dropped.has(c.candidate_id)).map((c) => {
          const unit = canonicalUnitSpelling(String(c.canonical_unit));
          const units = unit === c.canonical_unit ? {} : { canonical_unit: unit, previous_raw_unit: unit, current_raw_unit: unit };
          const kept = keep.get(c.candidate_id);
          if (!kept?.named) return { ...c, ...units };
          const relabel = (locator: any) => ({ ...locator, quoted_label: kept.canonical, printed_label: rawLabel(c) });
          return { ...c, ...units, source_metric_label: kept.canonical,
            current_source_locator: relabel(c.current_source_locator), previous_source_locator: relabel(c.previous_source_locator) };
        }) };
    }),
  };
}
