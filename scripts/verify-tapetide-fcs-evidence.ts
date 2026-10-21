import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalizeDynamicEvidence } from "../src/fundamental-review-dynamic-evidence.ts";
import {
  assessLifecycle, balanceSheetPeriodAllowed, balanceSheetPeriodEnd, checkpointFromScore, mergeCheckpoint, type FcsCheckpoint,
} from "../src/fundamental-review-history.ts";
import { publishedFundamentalReviewResult } from "../src/fundamental-review-contract.ts";
import {
  fiscalQuarterLabel, latestProviderQuarter, mergeProviderEvidence, PROVIDER_DISCLOSURE, tapetideCanonicalEvidence,
} from "../src/tapetide-fcs-evidence.ts";
// @ts-ignore The authoritative scorer is plain ESM in the sibling repository.
import { scoreFundamentalChangeReview as authoritativeScorer } from "../../alphasynth-bms-v2/src/fcs-review-scorer.mjs";

const scoreFundamentalChangeReview = authoritativeScorer as unknown as (input: Record<string, unknown>) => Record<string, any>;

const SYMBOL = "SOLARINDS";
const CUTOFF = "2026-10-15";

// Eight quarters shaped like Tapetide get_financials. Jun 2025 / Jun 2026
// values match the 19 October Solar Industries provider trace.
const quarters: Array<[string, string, number, number, number, string]> = [
  ["Sep 2024", "2024-09-30", 1700, 430, 290, "2024-11-08"],
  ["Dec 2024", "2024-12-31", 1900, 480, 320, "2025-02-07"],
  ["Mar 2025", "2025-03-31", 2050, 520, 340, "2025-05-09"],
  ["Jun 2025", "2025-06-30", 2154, 535, 353, "2025-08-08"],
  ["Sep 2025", "2025-09-30", 2400, 640, 420, "2025-11-07"],
  ["Dec 2025", "2025-12-31", 2900, 790, 520, "2026-02-06"],
  ["Mar 2026", "2026-03-31", 3300, 900, 600, "2026-05-08"],
  ["Jun 2026", "2026-06-30", 3668, 1015, 666, "2026-08-14"],
];
const observations = quarters.flatMap(([period, periodEnd, sales, operatingProfit, netProfit, availableAt]) => [
  { label: "Sales", period, periodEnd, value: sales, availableAt },
  { label: "Operating Profit", period, periodEnd, value: operatingProfit, availableAt },
  { label: "Net Profit", period, periodEnd, value: netProfit, availableAt },
]);
const payloadBytes = Buffer.from(JSON.stringify({ tool: "get_financials", symbol: SYMBOL, observations }));
const archiveUri = `gs://test-archive/fundamental-review-evidence/${createHash("sha256").update(payloadBytes).digest("hex")}.json`;

function officialRows(periodEnd: string, orderInflow: [number, number], netCash: [number, number], balanceSheetEnd: string) {
  const prior = `${Number(periodEnd.slice(0, 4)) - 1}${periodEnd.slice(4)}`;
  const document = (name: string) => ({
    source_ref: `https://nsearchives.nseindia.com/test/${name}-${periodEnd}.pdf`,
    source_date: "2026-08-14", document_sha256: createHash("sha256").update(`${name}-${periodEnd}`).digest("hex"),
    archived_document_uri: `gs://test-archive/${name}-${periodEnd}.pdf`,
  });
  const shared = { comparison_basis: "same_quarter_prior_year", consolidation_basis: "consolidated",
    previous_period_end_date: prior, current_period_end_date: periodEnd,
    previous_period: fiscalQuarterLabel(prior), current_period: fiscalQuarterLabel(periodEnd), unit: "INR crore" };
  const execution = document("execution");
  const balance = document(`balance-${balanceSheetEnd}`);
  const balancePrior = `${Number(balanceSheetEnd.slice(0, 4)) - 1}${balanceSheetEnd.slice(4)}`;
  return canonicalizeDynamicEvidence({
    ticker: SYMBOL, company_name: "Solar Industries India", information_cutoff: CUTOFF,
    rows: [
      { ...shared, factor: "execution", metric_name: "order_inflow", previous_value: orderInflow[0], current_value: orderInflow[1],
        source_ref: execution.source_ref, source_date: execution.source_date, document_sha256: execution.document_sha256,
        archived_document_uri: execution.archived_document_uri, quoted_label: "Order inflow", source_page: 4 },
      { ...shared, factor: "balance_sheet", metric_name: "net_cash", previous_value: netCash[0], current_value: netCash[1],
        comparison_basis: "point_in_time_prior_period",
        previous_period_end_date: balancePrior, current_period_end_date: balanceSheetEnd,
        previous_period: `As on ${balancePrior}`, current_period: `As on ${balanceSheetEnd}`,
        source_ref: balance.source_ref, source_date: balance.source_date, document_sha256: balance.document_sha256,
        archived_document_uri: balance.archived_document_uri, quoted_label: "Net cash", source_page: 6 },
      // An official revenue row that must be superseded by the provider policy.
      { ...shared, factor: "earnings", metric_name: "revenue", previous_value: 2150, current_value: 3670,
        source_ref: execution.source_ref, source_date: execution.source_date, document_sha256: execution.document_sha256,
        archived_document_uri: execution.archived_document_uri, quoted_label: "Revenue", source_page: 2 },
    ],
  });
}

function evidenceFor(periodEnd: string, orderInflow: [number, number], netCash: [number, number],
  balanceSheetEnd = balanceSheetPeriodEnd(periodEnd)) {
  const provider = tapetideCanonicalEvidence({ symbol: SYMBOL, companyName: "Solar Industries India", cutoff: CUTOFF,
    targetPeriodEnd: periodEnd, observations, payloadBytes, archiveUri, capturedAt: "2026-10-19T00:00:00.000Z" });
  return mergeProviderEvidence(officialRows(periodEnd, orderInflow, netCash, balanceSheetEnd), provider);
}

// 1. Labels and latest-quarter selection.
assert.equal(fiscalQuarterLabel("2026-06-30"), "Q1 FY27");
assert.equal(fiscalQuarterLabel("2026-03-31"), "Q4 FY26");
assert.equal(fiscalQuarterLabel("2025-12-31"), "Q3 FY26");
assert.equal(latestProviderQuarter(observations, CUTOFF), "2026-06-30");
assert.equal(latestProviderQuarter(observations, "2026-08-13"), "2026-03-31", "Jun 2026 was not available before 14 Aug");

// 2. Provider rows: Earnings (revenue + PAT) and Economics (derived EBITDA margin), disclosed.
const providerOnly = tapetideCanonicalEvidence({ symbol: SYMBOL, companyName: "Solar", cutoff: CUTOFF,
  targetPeriodEnd: "2026-06-30", observations, payloadBytes, archiveUri });
assert.deepEqual(providerOnly.candidates.map((c) => `${c.factor_id}:${c.canonical_metric_id}`).sort(),
  ["earnings:pat", "earnings:revenue", "economics:ebitda_margin"]);
const margin = providerOnly.candidates.find((c) => c.canonical_metric_id === "ebitda_margin");
assert.equal(margin.previous_canonical_value, 24.84);
assert.equal(margin.current_canonical_value, 27.67);
assert.equal(providerOnly.documents[0].source_tier, "secondary_discovery");
assert.equal(providerOnly.documents[0].disclosure, PROVIDER_DISCLOSURE);
assert.ok(providerOnly.validations.every((v) => v.status === "qualified_provisional"));

// 3. No archived snapshot -> no provider rows.
assert.equal(tapetideCanonicalEvidence({ symbol: SYMBOL, companyName: "Solar", cutoff: CUTOFF, targetPeriodEnd: "2026-06-30",
  observations, payloadBytes, archiveUri: null }).candidates.length, 0);

// 4. Missing official factor -> scorer refuses to publish.
const partial = mergeProviderEvidence({ candidates: [], documents: [], validations: [], diagnostics: [] }, providerOnly);
const blocked = scoreFundamentalChangeReview({ symbol: SYMBOL, ...partial });
assert.equal(blocked.score_publishable, false);
assert.deepEqual(blocked.missing_factors, ["execution", "balance_sheet"]);

// 5. Four factors -> publishable provisional FCS; official revenue superseded.
// June quarter: Balance Sheet comes from the 31 Mar 2026 half-year balance sheet,
// so it carries the same values as the March checkpoint below.
const current = evidenceFor("2026-06-30", [1200, 1500], [260, 330]);
assert.ok(current.diagnostics.some((d: any) => d.outcome === "official_earnings_economics_superseded_by_provider_policy"));
const score = scoreFundamentalChangeReview({ symbol: SYMBOL, ...current });
assert.equal(score.score_publishable, true, JSON.stringify(score.rejected_candidates ?? score.reasons));
assert.equal(score.publication_lane, "provisional");
assert.equal(score.rejected_candidates.length, 0);

// 6. Three consecutive quarters -> checkpoints share one comparability key -> lifecycle.
const scores = [
  ["2025-12-31", evidenceFor("2025-12-31", [1000, 1100], [250, 260])],
  ["2026-03-31", evidenceFor("2026-03-31", [1100, 1300], [260, 330])],
  ["2026-06-30", current],
] as const;
let history: FcsCheckpoint[] = [];
for (const [periodEnd, evidence] of scores) {
  const result = scoreFundamentalChangeReview({ symbol: SYMBOL, ...evidence });
  assert.equal(result.score_publishable, true, `${periodEnd}: ${JSON.stringify(result.rejected_candidates ?? result.reasons)}`);
  const checkpoint = checkpointFromScore({ symbol: SYMBOL, score: result, informationCutoff: CUTOFF,
    calculatedAt: "2026-10-19T00:00:00.000Z", sourceJobId: "test-job", documents: evidence.documents });
  assert.ok(checkpoint, `${periodEnd} must form a quarterly checkpoint`);
  assert.equal(checkpoint!.periodEnd, periodEnd);
  const balanceSheet = result.factors.find((factor: any) => factor.factor_id === "balance_sheet");
  assert.equal(balanceSheet.impacts[0].current_period.end_date, balanceSheetPeriodEnd(periodEnd), `${periodEnd} balance sheet date`);
  const providerReference = checkpoint!.documentReferences.find((d) => d.sourceType === "tapetide_structured_financials");
  assert.equal(providerReference?.crossVerification, "not_cross_verified_with_exchange_filing");
  assert.ok(checkpoint!.documentReferences.some((d) => !d.crossVerification), "official references keep their shape");
  history = mergeCheckpoint(history, checkpoint!);
  console.log(`${fiscalQuarterLabel(periodEnd)}  FCS ${result.fcs_score}  raw ${result.raw_score}`);
}
assert.equal(new Set(history.map((item) => item.comparabilityKey)).size, 1);
const lifecycle = assessLifecycle(history, CUTOFF, "2026-10-19T00:00:00.000Z");
assert.ok(lifecycle, "three comparable provider+official quarters must produce a lifecycle");
console.log(`Lifecycle: ${lifecycle!.classification} (${lifecycle!.reason})`);

// 6b. Half-year balance sheet rule (SEBI LODR Reg. 33).
assert.equal(balanceSheetPeriodEnd("2026-06-30"), "2026-03-31");
assert.equal(balanceSheetPeriodEnd("2025-12-31"), "2025-09-30");
assert.equal(balanceSheetPeriodEnd("2026-03-31"), "2026-03-31");
assert.equal(balanceSheetPeriodEnd("2025-09-30"), "2025-09-30");
assert.equal(balanceSheetPeriodAllowed("2026-06-30", "2026-06-30"), true, "a quarterly balance sheet, when published, is allowed");
assert.equal(balanceSheetPeriodAllowed("2026-06-30", "2025-12-31"), false, "an older balance sheet is never carried forward");
assert.equal(balanceSheetPeriodAllowed("2026-03-31", "2025-09-30"), false, "March quarters need the March balance sheet");
const staleBalanceSheet = scoreFundamentalChangeReview({ symbol: SYMBOL,
  ...evidenceFor("2026-06-30", [1200, 1500], [250, 260], "2025-12-31") });
assert.equal(staleBalanceSheet.score_publishable, true, "the frozen scorer itself is period-agnostic");
assert.equal(checkpointFromScore({ symbol: SYMBOL, score: staleBalanceSheet, informationCutoff: CUTOFF,
  calculatedAt: "2026-10-19T00:00:00.000Z", sourceJobId: "test-job" }), null, "history gate rejects a stale balance sheet");
const quarterlyExecutionMismatch = scoreFundamentalChangeReview({ symbol: SYMBOL, ...mergeProviderEvidence(
  officialRows("2026-03-31", [1100, 1300], [260, 330], "2026-03-31"),
  tapetideCanonicalEvidence({ symbol: SYMBOL, companyName: "Solar", cutoff: CUTOFF, targetPeriodEnd: "2026-06-30",
    observations, payloadBytes, archiveUri })) });
assert.equal(checkpointFromScore({ symbol: SYMBOL, score: quarterlyExecutionMismatch, informationCutoff: CUTOFF,
  calculatedAt: "2026-10-19T00:00:00.000Z", sourceJobId: "test-job" }), null, "Execution must still match the quarter exactly");

// 7. Public projection keeps the lane for the UI disclosure.
const published = publishedFundamentalReviewResult({ symbol: SYMBOL, status: "ready", completedFactors: 4, resultAvailable: true,
  scoreResult: { ...score, checkpoints: history } });
assert.equal(published?.publication_lane, "provisional");

console.log("Tapetide Earnings/Economics + official Execution/Balance Sheet evidence checks passed.");
