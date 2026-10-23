import assert from "node:assert/strict";
import { FundamentalReviewService } from "../src/fundamental-review-service.ts";
import { InMemoryFundamentalReviewStore } from "../src/fundamental-review-store.ts";
import { InMemoryFundamentalReviewQueue } from "../src/fundamental-review-queue.ts";
import { publishedFundamentalReviewResult } from "../src/fundamental-review-contract.ts";
import { tapetideCanonicalEvidence, mergeProviderEvidence } from "../src/tapetide-fcs-evidence.ts";
import { tapetideBalanceSheetEvidence } from "../src/tapetide-fcs-balance-sheet.ts";
import { tapetideExecutionEvidence } from "../src/tapetide-fcs-documents.ts";
import { sameSegment, segmentTokens } from "../src/fcs-segment-alignment.ts";
// @ts-ignore Plain ESM scorer in the sibling repository.
import { scoreFundamentalChangeReview as scorer } from "../../alphasynth-bms-v2/src/fcs-review-scorer.mjs";
const score = scorer as unknown as (input: Record<string, unknown>) => Record<string, any>;
const CUTOFF = "2026-10-22";

// Segment matching on meaningful words (real Glenmark wordings from 22 Oct).
assert.equal(sameSegment("India", "Sales for the formulation business in India"), true);
assert.equal(sameSegment("Glenmark's Europe operations", "Europe operations revenue"), true);
assert.equal(sameSegment("North America business", "Europe"), false);
assert.deepEqual(segmentTokens("Sales from the formulation business in India"), ["formulation", "india"]);

// Illustrative values; real wordings, units as printed (INR million, Rs.Cr style differences handled elsewhere).
const quarters = [
  { end: "2025-12-31", q: "Q3 FY26", prior: "Q3 FY25", priorEnd: "2024-12-31", segs: [["Sales for the formulation business in India", 12100, 13400], ["North America business", 7400, 7900], ["Glenmark's Europe operations", 6900, 8100]] },
  { end: "2026-03-31", q: "Q4 FY26", prior: "Q4 FY25", priorEnd: "2025-03-31", segs: [["India", 11800, 13900], ["North America", 7600, 8300], ["Europe", 7100, 8600]] },
  { end: "2026-06-30", q: "Q1 FY27", prior: "Q1 FY26", priorEnd: "2025-06-30", segs: [["Sales from the formulation business in India", 13000, 15200], ["Europe operations revenue", 7300, 8900]] },
] as const;
const quarterly = ["2024-12-31", "2025-03-31", "2025-06-30", "2025-12-31", "2026-03-31", "2026-06-30"].flatMap((end, i) => {
  const period = { "03": "Mar", "06": "Jun", "12": "Dec" }[end.slice(5, 7) as "03" | "06" | "12"] + " " + end.slice(0, 4);
  const availableAt = new Date(Date.parse(`${end}T00:00:00Z`) + 45 * 86_400_000).toISOString().slice(0, 10);
  return [{ label: "Sales", period, periodEnd: end, value: [3100, 3200, 3300, 3500, 3700, 3900][i], availableAt },
    { label: "Operating Profit", period, periodEnd: end, value: [560, 600, 620, 700, 760, 820][i], availableAt },
    { label: "Net Profit", period, periodEnd: end, value: [300, 320, 330, 380, 420, 460][i], availableAt }];
});
const bsObs = [["2024-03-31", 1900, "2024-05-20"], ["2025-03-31", 1700, "2025-05-20"], ["2026-03-31", 1500, "2026-05-20"]]
  .map(([periodEnd, value, availableAt]) => ({ label: "Borrowings", period: `Mar ${String(periodEnd).slice(0, 4)}`, periodEnd: String(periodEnd), value: Number(value), availableAt: String(availableAt) }));

async function bundleFor(target: string) {
  const q = quarters.find((item) => item.end === target)!;
  const text = `<!-- page 1 -->\nGlenmark ${q.q} earnings call.\n<!-- page 6 -->\n`
    + q.segs.map(([label, prev, cur]) => `${label} stood at INR ${cur.toLocaleString("en-IN")} million in ${q.q} against INR ${prev.toLocaleString("en-IN")} million in ${q.prior}.`).join("\n");
  const provider = tapetideCanonicalEvidence({ symbol: "GLENMARK", companyName: "Glenmark", cutoff: CUTOFF, targetPeriodEnd: target,
    observations: quarterly, payloadBytes: Buffer.from("q"), archiveUri: "gs://t/q.json" });
  const bs = tapetideBalanceSheetEvidence({ symbol: "GLENMARK", companyName: "Glenmark", cutoff: CUTOFF, targetPeriodEnd: target,
    observations: bsObs, payloadBytes: Buffer.from("b"), archiveUri: "gs://t/b.json" });
  const doc = await tapetideExecutionEvidence({ symbol: "GLENMARK", companyName: "Glenmark", cutoff: CUTOFF, targetPeriodEnd: target,
    metrics: [{ metric: "segment_revenue", units: ["Rs.Cr", "INR crore", "INR million", "INR billion"] }],
    callTool: async () => ({ data: { documents: [{ doc_id: 1, doc_type: "concall", doc_date: new Date(Date.parse(`${target}T00:00:00Z`) + 40 * 86_400_000).toISOString().slice(0, 10),
      has_markdown: true, links: { markdown_url: "https://filings.tapetide.com/x.md" } }] } }),
    fetchText: async () => text, archive: async (_b, sha) => `gs://t/${sha}.md`,
    extract: async () => q.segs.map(([label, prev, cur]) => ({ metricName: "segment_revenue", previousPeriod: q.prior, currentPeriod: q.q,
      previousPeriodEndDate: q.priorEnd, currentPeriodEndDate: target, previousValue: prev, currentValue: cur, unit: "INR million",
      quotedLabel: label, comparisonBasis: "same_quarter_prior_year" })) });
  assert.equal(doc.candidates.length, q.segs.length, `${q.q}: every segment row verified in its text`);
  const bundle = { ...provider, candidates: [...provider.candidates, ...bs.candidates, ...doc.candidates],
    documents: [...provider.documents, ...bs.documents, ...doc.documents], validations: [...provider.validations, ...bs.validations, ...doc.validations] };
  return mergeProviderEvidence({ candidates: [], documents: [], validations: [], diagnostics: [] }, bundle);
}

let scoringCalls = 0;
const store = new InMemoryFundamentalReviewStore();
let clock = new Date("2026-10-22T08:00:00Z");
const service = new FundamentalReviewService({ store, queue: new InMemoryFundamentalReviewQueue(),
  historicalBackfillEnabled: true, evidenceUrl: "https://test/evidence", scoringUrl: "https://test/score", now: () => clock,
  fetch: async (input, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(input).endsWith("/evidence")) return Response.json(await bundleFor(body.target_period_end || "2026-06-30"));
    scoringCalls += 1;
    return Response.json(score({ symbol: body.symbol, candidates: body.candidates, documents: body.documents, validations: body.validations }));
  } });
const job = await service.request({ symbol: "GLENMARK", companyName: "Glenmark Pharmaceuticals", informationCutoff: CUTOFF });
const done = await service.execute({ jobId: job.jobId!, symbol: "GLENMARK" });
const aligned: any = done.diagnostics.find((d: any) => d.outcome === "execution_aligned_across_quarters");
assert.ok(aligned, JSON.stringify(done.diagnostics.filter((d: any) => /execution_|alignment/.test(d.outcome))));
assert.deepEqual(aligned.segments, ["India", "Europe"], "North America is not in Q1, so it is left out of every quarter");
assert.equal(done.status, "ready", "FCS and three-quarter lifecycle ready");
const published: any = publishedFundamentalReviewResult(done);
assert.equal(published.lifecycle_ready, true);
assert.equal(published.checkpoints.length, 3);
assert.equal(new Set(published.checkpoints.map((c: any) => c.comparabilityKey)).size, 1);
assert.equal(published.fcs_score, published.checkpoints.at(-1).fcsScore, "headline FCS uses the same like-for-like measures as its lifecycle");
assert.equal(scoringCalls, 6, "3 raw scores + 3 aligned rescores");
console.log(`Glenmark-shaped worker run: ${published.lifecycle_assessment.classification}; FCS ${published.checkpoints.map((c: any) => `${c.periodLabel} ${c.fcsScore}`).join(" → ")}`);

// Stored earlier quarters measured differently (23 Oct, Eicher: VECV rows) are measured again and replaced.
const stored = (await store.readLatest("GLENMARK"))!;
stored.checkpointHistory = stored.checkpointHistory!.map((c: any) => c.periodEnd < "2026-06-30" ? { ...c, comparabilityKey: "f".repeat(64), fcsScore: 11 } : c);
await store.save(stored);
clock = new Date("2026-10-23T08:00:00Z");
const again = await service.request({ symbol: "GLENMARK", companyName: "Glenmark Pharmaceuticals", informationCutoff: "2026-10-23" });
assert.notEqual(again.jobId, job.jobId);
const redone = await service.execute({ jobId: again.jobId!, symbol: "GLENMARK" });
assert.deepEqual(redone.diagnostics.filter((d: any) => d.outcome === "historical_checkpoint_remeasured").map((d: any) => [d.period_end, d.replaced_fcs]),
  [["2026-03-31", 11], ["2025-12-31", 11]]);
assert.equal(redone.status, "ready", "lifecycle forms again after re-measuring");
assert.ok(!redone.checkpointHistory!.some((c: any) => c.fcsScore === 11), "the mismatched stored quarters were replaced");
console.log("Worker aligns Execution across quarters (segment wording, common segments) and publishes the lifecycle.");
