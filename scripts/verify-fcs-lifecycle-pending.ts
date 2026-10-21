import assert from "node:assert/strict";
import { lifecyclePendingExplanation } from "../src/fcs-lifecycle-pending.ts";
import { FundamentalReviewService } from "../src/fundamental-review-service.ts";
import { InMemoryFundamentalReviewStore } from "../src/fundamental-review-store.ts";
import { InMemoryFundamentalReviewQueue } from "../src/fundamental-review-queue.ts";
import { publishedFundamentalReviewResult } from "../src/fundamental-review-contract.ts";

// 1. Report wording (Option C): explicit, dated, and clear that the current FCS stands.
const solarGaps = [
  { period_end: "2026-03-31", balance_sheet_end: "2026-03-31", missing_factors: ["execution"] },
  { period_end: "2025-12-31", balance_sheet_end: "2025-09-30", missing_factors: ["balance_sheet"] },
];
const lines = lifecyclePendingExplanation("balance_sheet_printed_total_debt_not_found", solarGaps);
assert.match(lines[0], /no printed "Total Debt" line was found .* as at 30 Sep 2025\./);
assert.match(lines[0], /only from the company's own printed Total Debt/);
assert.ok(lines.includes("Quarter ending 31 Mar 2026: Execution not available from verified official sources."));
assert.ok(lines.includes("Quarter ending 31 Dec 2025: Balance Sheet not available from verified official sources."));
assert.equal(lines.at(-1), "A three-quarter lifecycle needs all four factors in each quarter. The current FCS above is unaffected.");
assert.match(lifecyclePendingExplanation("missing_or_noncomparable_quarterly_history", [])[0], /do not yet have four comparable/);
assert.deepEqual(lifecyclePendingExplanation(null, []), [], "nothing to explain when the lifecycle is ready");

// 2. Worker: a December quarter without a printed Total Debt is recorded, and the reason is published.
const factors = ["earnings", "economics", "execution", "balance_sheet"];
const impact = (factor: string, end: string) => ({ metric_id: factor === "balance_sheet" ? "total_debt" : `${factor}_metric`,
  comparison_basis: factor === "balance_sheet" ? "point_in_time_prior_period" : "same_quarter_prior_year", consolidation_basis: "consolidated",
  canonical_unit: "INR crore", previous_value: 1, current_value: 2, previous_document_id: "d1", current_document_id: "d2",
  previous_period: { label: "prior", end_date: "2025-03-31" }, current_period: { label: "Q1 FY27", end_date: end, duration_months: 3 },
  current_source_locator: { quoted_label: factor === "balance_sheet" ? "Total Debt" : factor } });
const currentScore = { symbol: "SOLARINDS", score_publishable: true, fcs_score: 74, raw_score: 0.9791, methodology_id: "m", impact_policy_id: "p",
  factors: factors.map((factor) => ({ factor_id: factor, impacts: [impact(factor, factor === "balance_sheet" ? "2026-03-31" : "2026-06-30")] })) };
const store = new InMemoryFundamentalReviewStore();
const service = new FundamentalReviewService({ store, queue: new InMemoryFundamentalReviewQueue(), historicalBackfillEnabled: true,
  evidenceUrl: "https://test/evidence", scoringUrl: "https://test/score", now: () => new Date("2026-10-21T08:00:00Z"),
  fetch: async (input, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(input).endsWith("/evidence")) {
      const end = body.target_period_end || "2026-06-30";
      // History: Q4 FY26 lacks Execution; Q3 FY26 lacks Balance Sheet (no printed Total Debt for 30 Sep 2025).
      const present = end === "2026-03-31" ? ["earnings", "economics", "balance_sheet"] : end === "2025-12-31" ? ["earnings", "economics", "execution"] : factors;
      const candidates = present.map((factor) => ({ candidate_id: `${factor}-${end}`, factor_id: factor,
        current_period: { end_date: factor === "balance_sheet" && end === "2026-06-30" ? "2026-03-31" : end } }));
      return Response.json({ candidates, documents: [], validations: candidates.map((c) => ({ candidate_id: c.candidate_id, status: "qualified" })) });
    }
    const ends = new Set(body.candidates.map((c: any) => c.current_period.end_date));
    if (ends.has("2026-06-30")) return Response.json(currentScore);
    const present = new Set(body.candidates.map((c: any) => c.factor_id));
    return Response.json({ symbol: "SOLARINDS", score_publishable: false, reasons: ["four_factor_gate_failed"],
      missing_factors: factors.filter((factor) => !present.has(factor)) });
  },
});
const job = await service.request({ symbol: "SOLARINDS", companyName: "Solar Industries India", informationCutoff: "2026-10-21" });
const done = await service.execute({ jobId: job.jobId!, symbol: "SOLARINDS" });
assert.equal(done.status, "score_ready_lifecycle_pending");
const published: any = publishedFundamentalReviewResult(done);
assert.equal(published.fcs_score, 74, "current FCS is published");
assert.equal(published.lifecycle_ready, false);
assert.equal(published.lifecycle_unavailable_reason, "balance_sheet_printed_total_debt_not_found");
assert.deepEqual(published.lifecycle_period_gaps, solarGaps);
console.log(lifecyclePendingExplanation(published.lifecycle_unavailable_reason, published.lifecycle_period_gaps).join("\n"));
console.log("\nFCS lifecycle-pending reason: recorded by the worker, published, and explained in plain language.");
