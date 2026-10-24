import assert from "node:assert/strict";
import { FundamentalReviewService } from "../src/fundamental-review-service.ts";
import { InMemoryFundamentalReviewStore } from "../src/fundamental-review-store.ts";
import { InMemoryFundamentalReviewQueue } from "../src/fundamental-review-queue.ts";
import { tapetideCanonicalEvidence, mergeProviderEvidence } from "../src/tapetide-fcs-evidence.ts";
import { tapetideBalanceSheetEvidence } from "../src/tapetide-fcs-balance-sheet.ts";
import { tapetideExecutionEvidence } from "../src/tapetide-fcs-documents.ts";
import { checkpointFromScore } from "../src/fundamental-review-history.ts";
// @ts-ignore Plain ESM scorer in the sibling repository.
import { scoreFundamentalChangeReview as scorer } from "../../alphasynth-bms-v2/src/fcs-review-scorer.mjs";
const score = scorer as unknown as (input: Record<string, unknown>) => Record<string, any>;

const listing = (end: string) => ({ data: { documents: [{ doc_id: 1, doc_type: "concall", has_markdown: true, links: { markdown_url: "https://filings.tapetide.com/x.md" },
  doc_date: new Date(Date.parse(`${end}T00:00:00Z`) + 40 * 86_400_000).toISOString().slice(0, 10) }] } });
const run = (text: string, end: string, rows: any[]) => tapetideExecutionEvidence({ symbol: "TVSMOTOR", companyName: "TVS Motor", cutoff: "2026-10-24", targetPeriodEnd: end,
  metrics: [{ metric: "sales_volume", units: ["units", "vehicles"] }], callTool: async () => listing(end), fetchText: async () => text,
  archive: async (_b, sha) => `gs://t/${sha}.md`, extract: async () => rows });

// 1. Vague period wording needs the quarter's identity nearby (TVS, 24 Oct).
const vague = { metricName: "sales_volume", previousPeriod: "last quarter of last year", currentPeriod: "Q1 this year", previousPeriodEndDate: "2025-06-30",
  currentPeriodEndDate: "2026-06-30", previousValue: 70000, currentValue: 130000, unit: "units", quotedLabel: "EV volume", comparisonBasis: "same_quarter_prior_year" };
const spoken = "<!-- page 9 -->\nOn EVs, we went from around 70,000 in the last quarter of last year to about 130,000 in Q1 this year, and EV volume keeps rising.";
assert.equal((await run(spoken, "2026-06-30", [vague])).candidates.length, 0, "no Q1 FY27 / Q1 FY26 identity nearby: refused");
assert.equal((await run("<!-- page 9 -->\nQ1 FY27 versus Q1 FY26. " + spoken, "2026-06-30", [vague])).candidates.length, 1, "identity printed nearby: kept");

// 2. Eicher, 24 Oct: the stored current-quarter checkpoint came from an earlier job (same measurement),
//    the earlier quarters were re-measured, and Q4 had two rows (Royal Enfield and VECV).
const CUTOFF = "2026-10-24";
const ends = ["2025-12-31", "2026-03-31", "2026-06-30"];
const exec: Record<string, Array<[string, number, number]>> = {
  "2025-12-31": [["motorcycles", 269039, 325773]],
  "2026-03-31": [["Total Volumes", 280801, 313811], ["Total Volumes", 31070, 34012]],
  "2026-06-30": [["motorcycles", 261326, 332940]],
};
const prior: Record<string, [string, string]> = { "2025-12-31": ["Q3 FY25", "2024-12-31"], "2026-03-31": ["Q4 FY25", "2025-03-31"], "2026-06-30": ["Q1 FY26", "2025-06-30"] };
const label: Record<string, string> = { "2025-12-31": "Q3 FY26", "2026-03-31": "Q4 FY26", "2026-06-30": "Q1 FY27" };
const quarterly = ["2024-12-31", "2025-03-31", "2025-06-30", "2025-12-31", "2026-03-31", "2026-06-30"].flatMap((end, i) => {
  const period = { "03": "Mar", "06": "Jun", "12": "Dec" }[end.slice(5, 7) as "03" | "06" | "12"] + " " + end.slice(0, 4);
  const availableAt = new Date(Date.parse(`${end}T00:00:00Z`) + 45 * 86_400_000).toISOString().slice(0, 10);
  return [{ label: "Sales", period, periodEnd: end, value: [4973, 5241, 5042, 6114, 6080, 6632][i], availableAt },
    { label: "Operating Profit", period, periodEnd: end, value: [1201, 1258, 1203, 1557, 1514, 1591][i], availableAt },
    { label: "Net Profit", period, periodEnd: end, value: [1170, 1362, 1205, 1421, 1520, 1463][i], availableAt }];
});
const bs = [["2024-03-31", 419, "2024-05-20"], ["2025-03-31", 458, "2025-05-20"], ["2026-03-31", 514, "2026-05-20"]]
  .map(([periodEnd, value, availableAt]) => ({ label: "Borrowings", period: `Mar ${String(periodEnd).slice(0, 4)}`, periodEnd: String(periodEnd), value: Number(value), availableAt: String(availableAt) }));
async function bundleFor(end: string) {
  const text = `<!-- page 1 -->\nEicher ${label[end]} results.\n<!-- page 4 -->\n` + exec[end].map(([l, p, c]) => `${l}: ${c} motorcycles in ${label[end]} against ${p} in ${prior[end][0]}.`).join("\n");
  const provider = tapetideCanonicalEvidence({ symbol: "EICHERMOT", companyName: "Eicher", cutoff: CUTOFF, targetPeriodEnd: end, observations: quarterly, payloadBytes: Buffer.from("q"), archiveUri: "gs://t/q.json" });
  const balance = tapetideBalanceSheetEvidence({ symbol: "EICHERMOT", companyName: "Eicher", cutoff: CUTOFF, targetPeriodEnd: end, observations: bs, payloadBytes: Buffer.from("b"), archiveUri: "gs://t/b.json" });
  const doc = await tapetideExecutionEvidence({ symbol: "EICHERMOT", companyName: "Eicher", cutoff: CUTOFF, targetPeriodEnd: end,
    metrics: [{ metric: "sales_volume", units: ["units", "vehicles"] }], callTool: async () => listing(end), fetchText: async () => text, archive: async (_b, sha) => `gs://t/${sha}.md`,
    extract: async () => exec[end].map(([l, p, c]) => ({ metricName: "sales_volume", previousPeriod: prior[end][0], currentPeriod: label[end], previousPeriodEndDate: prior[end][1],
      currentPeriodEndDate: end, previousValue: p, currentValue: c, unit: "motorcycles", quotedLabel: l, comparisonBasis: "same_quarter_prior_year" })) });
  return mergeProviderEvidence({ candidates: [], documents: [], validations: [], diagnostics: [] }, { ...provider,
    candidates: [...provider.candidates, ...balance.candidates, ...doc.candidates], documents: [...provider.documents, ...balance.documents, ...doc.documents],
    validations: [...provider.validations, ...balance.validations, ...doc.validations] });
}
// Yesterday's job stored the same current-quarter measurement; its earlier quarters used other rows.
const q1 = await bundleFor("2026-06-30");
const storedCurrent = checkpointFromScore({ symbol: "EICHERMOT", score: score({ symbol: "EICHERMOT", ...q1 }), informationCutoff: "2026-10-23", calculatedAt: "t", sourceJobId: "old-job", documents: q1.documents })!;
const store = new InMemoryFundamentalReviewStore();
await store.save({ jobId: "old-job", symbol: "EICHERMOT", companyName: "Eicher", status: "score_ready_lifecycle_pending", completedFactors: 4, totalFactors: 4,
  requestedAt: "2026-10-23T07:04:01Z", updatedAt: "2026-10-23T07:04:46Z", message: "", resultAvailable: true, informationCutoff: "2026-10-23",
  evidenceRows: [], diagnostics: [], scoreResult: null, failureCode: null, lastCompletedLifecycle: null,
  checkpointHistory: [{ ...storedCurrent, periodEnd: "2025-12-31", periodLabel: "Q3 FY26", comparabilityKey: "a".repeat(64), fcsScore: 65 },
    { ...storedCurrent, periodEnd: "2026-03-31", periodLabel: "Q4 FY26", comparabilityKey: "b".repeat(64), fcsScore: 71 }, storedCurrent] } as any);
const service = new FundamentalReviewService({ store, queue: new InMemoryFundamentalReviewQueue(), historicalBackfillEnabled: true,
  evidenceUrl: "https://test/evidence", scoringUrl: "https://test/score", now: () => new Date("2026-10-24T06:00:00Z"),
  fetch: async (input, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(input).endsWith("/evidence")) return Response.json(await bundleFor(body.target_period_end || "2026-06-30"));
    return Response.json(score({ symbol: body.symbol, candidates: body.candidates, documents: body.documents, validations: body.validations }));
  } });
const job = await service.request({ symbol: "EICHERMOT", companyName: "Eicher Motors", informationCutoff: CUTOFF });
const done = await service.execute({ jobId: job.jobId!, symbol: "EICHERMOT" });
const outcomes = done.diagnostics.map((d: any) => d.outcome);
assert.ok(outcomes.includes("execution_aligned_across_quarters"), JSON.stringify(done.diagnostics.filter((d: any) => /align|remeasured|comparable/.test(d.outcome))));
assert.ok(outcomes.includes("checkpoint_replaced_by_aligned_measurement"), "the earlier job's current-quarter checkpoint is replaced, and logged");
assert.equal(done.status, "ready", done.message);
assert.equal(new Set(done.checkpointHistory!.filter((c: any) => c.informationCutoff === CUTOFF).map((c: any) => c.comparabilityKey)).size, 1);
console.log(`Eicher-shaped re-run: ${done.scoreResult?.lifecycle}; ${done.checkpointHistory!.map((c: any) => `${c.periodLabel} ${c.fcsScore}`).join(" → ")}`);
console.log("Vague period wording needs the quarter's identity; re-measured quarters align even when the current checkpoint was stored earlier.");
