import assert from "node:assert/strict";
import { countScale, deriveFourthQuarter, derivationAcceptable, growthUncertaintyPp, printedHalfWidth, printedSide,
  type PrintedComponent } from "../src/fcs-derived-quarter.ts";
import { normalisePeriodWording, rankByContent, tapetideExecutionEvidence, textSupportsValue, type ExtractedRow,
  type ExtractedValue } from "../src/tapetide-fcs-documents.ts";
import { tapetideCanonicalEvidence } from "../src/tapetide-fcs-evidence.ts";
import { tapetideBalanceSheetEvidence } from "../src/tapetide-fcs-balance-sheet.ts";
import { checkpointFromScore, historyMetricDefinitions } from "../src/fundamental-review-history.ts";
// @ts-ignore Plain ESM scorer in the sibling repository.
import { scoreFundamentalChangeReview as scorer } from "../../alphasynth-bms-v2/src/fcs-review-scorer.mjs";
const score = scorer as unknown as (input: Record<string, unknown>) => Record<string, any>;
const CUTOFF = "2026-10-22";

// 1. Printed precision and period wording.
assert.deepEqual(countScale("lakh motorcycles"), { scale: 100_000, rest: "motorcycles" });
assert.deepEqual(countScale("Rs crores"), { scale: 1, rest: "Rs crores" }, "money units keep their own scale");
assert.equal(printedHalfWidth(12.27, 100_000), 500, "12.27 lakh is exact only to ±500");
assert.equal(printedHalfWidth(280801), 0.5);
assert.equal(normalisePeriodWording("in the 4th Quarter"), "in the q4");
assert.equal(normalisePeriodWording("Q1 of FY2025"), "q1 fy25");
assert.equal(normalisePeriodWording("financial year 2026 and FY 2025-26"), "fy26 and fy26");
assert.equal(normalisePeriodWording("FY 26-27"), "fy27", "existing rule kept");

// 2. Arithmetic on Eicher's printed figures. FY25 checks the method: printed Q4 FY25 = 2,80,801.
const c = (value: number, halfWidth = 0.5, period = ""): PrintedComponent => ({ value, halfWidth, period, documentId: "", docId: 0, page: null, quoted: String(value) });
const fy25 = deriveFourthQuarter(c(1_002_893), [c(227_736), c(225_317), c(269_039)]);
assert.ok(!("reject" in fy25) && fy25.value === 280_801, "FY25 total − Q1..Q3 FY25 equals the printed Q4 FY25");
const fy26 = deriveFourthQuarter(c(1_227_000, 500), [c(261_326), c(327_067), c(325_773)]);
assert.ok(!("reject" in fy26));
if (!("reject" in fy26)) {
  assert.equal(fy26.value, 312_834);
  assert.deepEqual([fy26.low, fy26.high], [312_332.5, 313_335.5]);
  const uncertainty = growthUncertaintyPp(fy26, printedSide(c(280_801)));
  assert.ok(uncertainty > 0.17 && uncertainty < 0.19, `rounding moves growth by ${uncertainty} pp`);
  assert.equal(derivationAcceptable("sales_volume", fy26, printedSide(c(280_801))), null);
  assert.equal(derivationAcceptable("order_book", fy26, printedSide(c(280_801))), "metric_not_additive", "balances are never derived");
}
const roughTotal = deriveFourthQuarter(c(1_200_000, 50_000), [c(261_326), c(327_067), c(325_773)]);   // "1.2 million"
assert.ok(!("reject" in roughTotal) && derivationAcceptable("sales_volume", roughTotal, printedSide(c(280_801))) === "rounding_uncertainty_too_large");
assert.deepEqual(deriveFourthQuarter(c(332_940), [c(261_326), c(327_067), c(325_773)]), { reject: "derived_value_not_positive" }, "a quarter misread as the year");
assert.deepEqual(deriveFourthQuarter(c(1_700_000), [c(261_326), c(327_067), c(325_773)]), { reject: "derived_value_implausible_vs_first_three_quarters" });

// 3. A single printed value must sit beside its label with its period wording nearby.
const may2026 = "<!-- page 1 -->\nRoyal Enfield results for the fourth quarter and financial year ended March 31, 2026.\n<!-- page 4 -->\n"
  + "For the full financial year, we recorded our highest ever annual sales performance with 12.27 lakh motorcycles sold.";
assert.deepEqual(textSupportsValue(may2026, { labels: ["motorcycles"], value: 12.27, wording: "full financial year" }), { ok: true, page: 4 });
assert.equal(textSupportsValue(may2026, { labels: ["motorcycles"], value: 12.72, wording: "full financial year" }).ok, false);

// 4. Havells: the Q4 FY26 segment table sits in the "Information Update" listed beside copies of the call.
const transcript = (n: number) => `<!-- page 1 -->\nHavells Q4 FY26 earnings call. Cables and wires grew 14% with 6% volume growth. Lighting broadly flat. `
  + `Capex of INR 800 crores, 4,000 crores deployed in Lloyd, 2,500 dealers${n ? `, copy ${n}` : ""}.`;
const informationUpdate = "<!-- page 1 -->\nInformation Update on the Financial Results for the fourth quarter and financial year ended 31st March, 2026\n"
  + "<!-- page 5 -->\n### 2. Segment Wise – Quarterly\n| (In Rs crores) | Q4 FY26 | Q4 FY25 | YoY (%) | Q3 FY26 |\n|---|---|---|---|---|\n"
  + "| Switchgears | 736 | 691 | 6.4% | 624 |\n| Cables | 2,474 | 2,169 | 14.0% | 2,241 |\n| Lighting & Fixtures | 438 | 436 | 0.5% | 423 |";
assert.deepEqual(rankByContent([{ text: transcript(0) }, { text: informationUpdate }], "2026-03-31").map((d) => d.text), [informationUpdate, transcript(0)]);

const listingOf = (docs: Array<[number, string, string]>) => ({ data: { documents: docs.map(([doc_id, doc_date, doc_type]) => ({ doc_id, doc_type, doc_date,
  period: doc_date.slice(0, 7), has_markdown: true, links: { markdown_url: `https://filings.tapetide.com/documents/concall/1/${doc_id}.md` } })) } });
const tools = (listing: unknown) => {
  const calls: string[] = [];
  return { calls, callTool: async (name: string) => { calls.push(name); if (name === "list_company_documents") return listing; throw new Error(`unexpected ${name}`); } };
};
const havellsTexts: Record<number, string> = { 17077911: transcript(0), 11953545: transcript(1), 10856073: transcript(2), 10525236: informationUpdate };
const havellsTools = tools(listingOf([[17077911, "2026-04-22", "concall"], [11953545, "2026-04-22", "concall"], [10856073, "2026-04-22", "concall"], [10525236, "2026-04-22", "concall"]]));
const extracted: number[] = [];
const havells = await tapetideExecutionEvidence({ symbol: "HAVELLS", companyName: "Havells", cutoff: CUTOFF, targetPeriodEnd: "2026-03-31",
  metrics: [{ metric: "segment_revenue", units: ["Rs.Cr", "INR crore", "INR million", "INR billion"] }],
  callTool: havellsTools.callTool, archive: async (_b, sha) => `gs://t/${sha}.md`,
  fetchText: async (url) => havellsTexts[Number(url.match(/(\d+)\.md$/)![1])],
  extract: async ({ text }) => {
    extracted.push(text.length);
    return text.includes("| Switchgears |") ? [["Switchgears", 691, 736], ["Cables", 2169, 2474], ["Lighting & Fixtures", 436, 438]].map(([label, prev, cur]) => ({
      metricName: "segment_revenue", previousPeriod: "Q4 FY25", currentPeriod: "Q4 FY26", previousPeriodEndDate: "2025-03-31", currentPeriodEndDate: "2026-03-31",
      previousValue: Number(prev), currentValue: Number(cur), unit: "Rs crores", quotedLabel: String(label), comparisonBasis: "same_quarter_prior_year" })) : [];
  } });
assert.deepEqual(havells.candidates.map((x) => `${x.source_metric_label} ${x.previous_canonical_value}->${x.current_canonical_value} ${x.canonical_unit} p${x.current_source_locator.page}`),
  ["Switchgears 691->736 INR crore p5", "Cables 2169->2474 INR crore p5", "Lighting & Fixtures 436->438 INR crore p5"]);
assert.equal(extracted.length, 1, "the table document is read first; one model read");
assert.deepEqual(havellsTools.calls, ["list_company_documents"], "no read_document plan calls");
assert.equal(havells.documents[0].tapetide_doc_id, 10525236);

// 5. Eicher: Q4 FY26 derived from printed figures across five results calls (real wording, shortened).
const eicherTexts: Record<number, string> = {
  17067365: "<!-- page 1 -->\nEarnings call for the quarter ended June 30, 2025.\n<!-- page 3 -->\nDuring this quarter, we sold 2,61,326 motorcycles with a growth of 14.7% as against 2,27,736 in Q1 of FY2025.",
  17067364: "<!-- page 1 -->\nEarnings call, Q2 FY '26.\n<!-- page 3 -->\nDuring this quarter, we sold 3,27,067 motorcycles as against 2,25,317 in Q2 FY '25.",
  17067363: "<!-- page 1 -->\nEarnings call, Q3 FY '26.\n<!-- page 3 -->\nComing to the volumes during this quarter, we sold 3,25,773 motorcycles with a growth of 21% as against 2,69,039 motorcycles in Q3 FY 2025.",
  17067362: may2026 + " Domestic sales grew 23% to 1.1 million units.",
  17067366: "<!-- page 1 -->\nResults for the fourth quarter and financial year ended March 31, 2025.\n<!-- page 2 -->\n"
    + "Our motorcycles continue to do well with the sales of about 2,80,801 motorcycles in the 4th Quarter up by almost about 23.2% year-on-year.",
};
const quarterRows: Record<string, [string, string, string, number, number]> = {
  "2025-06-30": ["Q1 of FY2025", "Q1 FY26", "2024-06-30", 227_736, 261_326],
  "2025-09-30": ["Q2 FY '25", "Q2 FY '26", "2024-09-30", 225_317, 327_067],
  "2025-12-31": ["Q3 FY 2025", "Q3 FY '26", "2024-12-31", 269_039, 325_773],
};
const eicherTools = tools(listingOf([[17067362, "2026-05-01", "concall"], [17067363, "2026-02-01", "concall"], [17067364, "2025-11-01", "concall"],
  [17067365, "2025-08-01", "concall"], [17067366, "2025-05-01", "concall"]]));
const valueRequests: string[][] = [];
const eicher = await tapetideExecutionEvidence({ symbol: "EICHERMOT", companyName: "Eicher Motors", cutoff: CUTOFF, targetPeriodEnd: "2026-03-31",
  metrics: [{ metric: "sales_volume", units: ["units", "vehicles", "thousand units", "million units"] }],
  callTool: eicherTools.callTool, archive: async (_b, sha) => `gs://t/${sha}.md`,
  fetchText: async (url) => eicherTexts[Number(url.match(/(\d+)\.md$/)![1])],
  extract: async ({ targetPeriodEnd }): Promise<ExtractedRow[]> => {
    const q = quarterRows[targetPeriodEnd];
    return q ? [{ metricName: "sales_volume", previousPeriod: q[0], currentPeriod: q[1], previousPeriodEndDate: q[2], currentPeriodEndDate: targetPeriodEnd,
      previousValue: q[3], currentValue: q[4], unit: "motorcycles", quotedLabel: "motorcycles", comparisonBasis: "same_quarter_prior_year" }] : [];   // Q4 call: no quarter figure
  },
  extractValues: async ({ text, requests }): Promise<ExtractedValue[]> => {
    valueRequests.push(requests.map((r) => r.key));
    const out: ExtractedValue[] = [];
    if (text.includes("12.27 lakh")) out.push({ key: "0:fy:2026", value: 12.27, unit: "lakh motorcycles", quotedLabel: "motorcycles sold", periodWording: "full financial year" },
      { key: "0:fy:2025", value: 1.1, unit: "million units", quotedLabel: "Domestic sales", periodWording: "last year" });   // wrong measure: refused
    if (text.includes("2,80,801")) out.push({ key: "0:q4:2025", value: 280801, unit: "motorcycles", quotedLabel: "motorcycles", periodWording: "4th Quarter" });
    return out;
  } });
const derived = eicher.candidates[0];
assert.ok(derived, JSON.stringify(eicher.diagnostics.filter((d) => /derived|not_verified|unit|period/.test(String(d.outcome)))));
assert.equal(eicher.candidates.length, 1);
assert.deepEqual([derived.previous_period.label, derived.previous_canonical_value, derived.current_period.label, derived.current_canonical_value, derived.canonical_unit],
  ["Q4 FY25", 280_801, "Q4 FY26", 312_834, "units"]);
assert.equal(derived.extraction_method, "derived_full_year_minus_first_three_quarters");
assert.match(derived.current_source_locator.quoted_label, /^motorcycles — Q4 FY26 \(derived: FY26 full year − Q1 to Q3; .*not cross-verified with NSE\/BSE\)$/);
assert.match(derived.previous_source_locator.quoted_label, /Q4 FY25 \(as printed;/);
assert.equal(derived.current_source_locator.derivation.current.how,
  "FY26 total 12.27 lakh motorcycles − (Q1 2,61,326 + Q2 3,27,067 + Q3 3,25,773) = 3,12,834 (±502 from rounding of the printed total)");
assert.deepEqual(eicher.validations[0].checks.map((check: any) => `${check.check_id}:${check.status}`), ["derived.components_beside_labels:pass",
  "derived.additive_measure:pass", "derived.rounding_within_tolerance:pass", "derived.plausible_against_first_three_quarters:pass",
  "source.exchange_filing_cross_verification:needs_review"]);
assert.equal(eicher.validations[0].status, "qualified_provisional");
assert.deepEqual(eicher.documents.map((d) => d.tapetide_doc_id).sort(), [17067362, 17067363, 17067364, 17067365, 17067366], "every component document archived");
assert.deepEqual(eicherTools.calls, ["list_company_documents"], "derivation uses free Markdown links only");
assert.equal(eicher.diagnostics.find((d) => d.key === "0:fy:2025")?.outcome, "not_a_full_year_figure",
  "'1.1 million' domestic units is not accepted as the FY25 motorcycle total");
assert.equal(valueRequests.length, 2, "current Q4 call, then the prior-year Q4 call for the missing FY25 figure");

// 6. The derived row scores like any Execution row and keeps the lifecycle series identity.
const quarterly = ["2025-03-31", "2025-12-31", "2026-03-31", "2024-12-31"].flatMap((end, i) => {
  const period = { "03": "Mar", "12": "Dec" }[end.slice(5, 7) as "03" | "12"] + " " + end.slice(0, 4);
  const availableAt = new Date(Date.parse(`${end}T00:00:00Z`) + 45 * 86_400_000).toISOString().slice(0, 10);
  return [{ label: "Sales", period, periodEnd: end, value: [5241, 6114, 6080, 4973][i], availableAt },
    { label: "Operating Profit", period, periodEnd: end, value: [1258, 1557, 1514, 1201][i], availableAt },
    { label: "Net Profit", period, periodEnd: end, value: [1362, 1421, 1520, 1170][i], availableAt }];
});
const bsObs = [["2024-03-31", 419, "2024-05-20"], ["2025-03-31", 458, "2025-05-20"], ["2026-03-31", 514, "2026-05-20"]]
  .map(([periodEnd, value, availableAt]) => ({ label: "Borrowings", period: `Mar ${String(periodEnd).slice(0, 4)}`, periodEnd: String(periodEnd), value: Number(value), availableAt: String(availableAt) }));
const bundle = (target: string, execution: { candidates: any[]; documents: any[]; validations: any[] }) => {
  const provider = tapetideCanonicalEvidence({ symbol: "EICHERMOT", companyName: "Eicher", cutoff: CUTOFF, targetPeriodEnd: target, observations: quarterly, payloadBytes: Buffer.from("q"), archiveUri: "gs://t/q.json" });
  const bs = tapetideBalanceSheetEvidence({ symbol: "EICHERMOT", companyName: "Eicher", cutoff: CUTOFF, targetPeriodEnd: target, observations: bsObs, payloadBytes: Buffer.from("b"), archiveUri: "gs://t/b.json" });
  return { symbol: "EICHERMOT", candidates: [...provider.candidates, ...bs.candidates, ...execution.candidates],
    documents: [...provider.documents, ...bs.documents, ...execution.documents], validations: [...provider.validations, ...bs.validations, ...execution.validations] };
};
const q4Bundle = bundle("2026-03-31", eicher);
const q4Score = score(q4Bundle);
assert.equal(q4Score.score_publishable, true, JSON.stringify(q4Score.missing_factors));
const executionImpact = q4Score.factors.find((f: any) => f.factor_id === "execution").impacts[0];
assert.ok(executionImpact.current_source_locator.derivation, "the derivation travels with the scored impact to the report");
// A printed Q3 FY26 row from the same reader has the same series identity.
const q3 = await tapetideExecutionEvidence({ symbol: "EICHERMOT", companyName: "Eicher Motors", cutoff: CUTOFF, targetPeriodEnd: "2025-12-31",
  metrics: [{ metric: "sales_volume", units: ["units", "vehicles", "thousand units", "million units"] }], callTool: tools(listingOf([[17067363, "2026-02-01", "concall"]])).callTool,
  archive: async (_b, sha) => `gs://t/${sha}.md`, fetchText: async () => eicherTexts[17067363],
  extract: async ({ targetPeriodEnd }) => { const q = quarterRows[targetPeriodEnd]; return [{ metricName: "sales_volume", previousPeriod: q[0], currentPeriod: q[1],
    previousPeriodEndDate: q[2], currentPeriodEndDate: targetPeriodEnd, previousValue: q[3], currentValue: q[4], unit: "motorcycles", quotedLabel: "motorcycles", comparisonBasis: "same_quarter_prior_year" }]; } });
const q3Score = score(bundle("2025-12-31", q3));
const key = (s: any, docs: any[]) => checkpointFromScore({ symbol: "EICHERMOT", score: s, informationCutoff: CUTOFF, calculatedAt: "t", sourceJobId: "t", documents: docs })!;
const q4Checkpoint = key(q4Score, q4Bundle.documents);
assert.equal(q4Checkpoint.comparabilityKey, key(q3Score, bundle("2025-12-31", q3).documents).comparabilityKey, "derived Q4 and printed Q3 are one series");
assert.ok(q4Checkpoint.evidenceReferences.some((r: any) => (r.currentLocator as any)?.derivation), "lifecycle table can mark the derived quarter");

// 7. 23 Oct live run regressions.
// (a) Havells Q1 FY27: the short "Information Update" with the segment table must not be
//     dropped as a duplicate of the call transcript that reads the same figures out.
const q1Update = "<!-- page 1 -->\nInformation Update Q1 2026-27\n<!-- page 5 -->\n| | Q1 FY27 | Q1 FY26 | YoY (%) | Q4 FY26 |\n|---|---|---|---|---|\n"
  + "| Switchgears | 608 | 630 | (3.5)% | 736 |\n| Cables | 2,456 | 1,933 | 27.1% | 2,474 |";
const q1Call = "<!-- page 1 -->\nHavells Q1 FY27 (2026-27) earnings call. " + Array.from({ length: 30 }, (_, i) => `figure ${1000 + i * 37},`).join(" ")
  + " Switchgears at 608 versus 630, Cables at 2,456 versus 1,933, versus 736 and 2,474 last quarter.";
const q1Read: string[] = [];
const q1 = await tapetideExecutionEvidence({ symbol: "HAVELLS", companyName: "Havells", cutoff: CUTOFF, targetPeriodEnd: "2026-06-30",
  metrics: [{ metric: "segment_revenue", units: ["Rs.Cr", "INR crore"] }], archive: async (_b, sha) => `gs://t/${sha}.md`,
  callTool: tools(listingOf([[24499162, "2026-07-17", "concall"], [23531160, "2026-07-17", "concall"]])).callTool,
  fetchText: async (url) => (url.includes("24499162") ? q1Call : q1Update),
  extract: async ({ text }) => { q1Read.push(text === q1Update ? "update" : "call"); return text === q1Update ? [{ metricName: "segment_revenue", previousPeriod: "Q1 FY26",
    currentPeriod: "Q1 FY27", previousPeriodEndDate: "2025-06-30", currentPeriodEndDate: "2026-06-30", previousValue: 1933, currentValue: 2456, unit: "Rs crores",
    quotedLabel: "Cables", comparisonBasis: "same_quarter_prior_year" }] : []; } });
assert.deepEqual(q1Read, ["update"], "the table document is kept and read first");
assert.equal(q1.candidates.length, 1);

// (b) Eicher history: the current quarter's row label steers earlier quarters to motorcycles, not VECV trucks.
const definitions = historyMetricDefinitions({ factors: [{ factor_id: "execution", impacts: [{ metric_id: "sales_volume", canonical_unit: "units",
  comparison_basis: "same_quarter_prior_year", current_source_locator: { quoted_label: "motorcycles — Q1 FY27 (company document text via Tapetide, not cross-verified with NSE/BSE)" } }] }] });
assert.equal(definitions[0].label_hint, "motorcycles");
assert.equal("source_label" in definitions[0], false, "a hint only; the series identity is unchanged");
const hintsSeen: unknown[] = [];
const q3Hinted = await tapetideExecutionEvidence({ symbol: "EICHERMOT", companyName: "Eicher Motors", cutoff: CUTOFF, targetPeriodEnd: "2025-12-31",
  metrics: [{ metric: "sales_volume", units: ["units", "vehicles"] }], labelHints: [String(definitions[0].label_hint)],
  callTool: tools(listingOf([[17067363, "2026-02-01", "concall"]])).callTool, archive: async (_b, sha) => `gs://t/${sha}.md`,
  fetchText: async () => eicherTexts[17067363] + "\nVECV recorded Q3 volumes of 26,086 units against 21,010 units in Q3 FY 2025.",
  extract: async ({ labelHints }) => { hintsSeen.push(labelHints); return [
    { metricName: "sales_volume", previousPeriod: "Q3 FY 2025", currentPeriod: "Q3 FY '26", previousPeriodEndDate: "2024-12-31", currentPeriodEndDate: "2025-12-31",
      previousValue: 21010, currentValue: 26086, unit: "units", quotedLabel: "VECV", comparisonBasis: "same_quarter_prior_year" },
    { metricName: "sales_volume", previousPeriod: "Q3 FY 2025", currentPeriod: "Q3 FY '26", previousPeriodEndDate: "2024-12-31", currentPeriodEndDate: "2025-12-31",
      previousValue: 269039, currentValue: 325773, unit: "motorcycles", quotedLabel: "motorcycles", comparisonBasis: "same_quarter_prior_year" }]; } });
assert.deepEqual(hintsSeen, [["motorcycles"]], "the extractor is told which row to report");
assert.deepEqual(q3Hinted.candidates.map((c) => `${c.source_metric_label} ${c.current_canonical_value}`), ["motorcycles 325773"], "the VECV row is not kept");

console.log(`Havells Q4 FY26 read from its Information Update table (page 5); Eicher Q4 FY26 derived: ${derived.current_source_locator.derivation.current.how}; FCS ${q4Score.fcs_score}.`);
console.log("Derived March-quarter rule (additive only, printed components verified, rounding ≤ 0.5 pp, labelled 'derived') verified.");
