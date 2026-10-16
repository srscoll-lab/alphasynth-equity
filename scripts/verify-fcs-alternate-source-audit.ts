import assert from "node:assert/strict";
import { compareAlternateSourceWithOfficial, summarizeAlternateSourceAudit } from "../src/fcs-alternate-source-audit.ts";

const source = "https://company.example/investors/results.pdf";
const provider = {
  symbol: "TEST",
  provider: "tapetide",
  metrics: [
    { metricId: "revenue", periodEnd: "2026-06-30", periodType: "quarter" as const, value: 1000, unit: "INR crore", publishedAt: "2026-07-25" },
    { metricId: "pat_margin", periodEnd: "2026-06-30", periodType: "quarter" as const, value: 10.01, unit: "%", publishedAt: "2026-07-25" },
    { metricId: "total_debt", periodEnd: "2026-06-30", periodType: "quarter" as const, value: 900, unit: "INR crore", publishedAt: "2026-07-25" },
    { metricId: "future_value", periodEnd: "2026-09-30", periodType: "quarter" as const, value: 12, unit: "%", publishedAt: "2026-11-01" },
  ],
};
const official = {
  symbol: "TEST",
  provider: "issuer_filing",
  metrics: [
    { metricId: "revenue", periodEnd: "2026-06-30", periodType: "quarter" as const, value: 1004, unit: "INR crore", publishedAt: "2026-07-24", sourceUrl: source },
    { metricId: "pat_margin", periodEnd: "2026-06-30", periodType: "quarter" as const, value: 10, unit: "%", publishedAt: "2026-07-24", sourceUrl: source },
    { metricId: "total_debt", periodEnd: "2026-06-30", periodType: "quarter" as const, value: 800, unit: "INR crore", publishedAt: "2026-07-24", sourceUrl: source },
  ],
};

const comparisons = compareAlternateSourceWithOfficial({ provider, official, cutoff: "2026-10-13" });
assert.deepEqual(comparisons.map((item) => item.status), ["match", "match", "mismatch", "not_comparable"]);
assert.equal(comparisons[3].reason, "provider_publication_after_cutoff");
assert.deepEqual(summarizeAlternateSourceAudit(comparisons), { observations: 4, comparable: 3, matches: 2, mismatches: 1, agreementPct: 66.7, publishable: false });
console.log("FCS alternate-source audit contract verified.");
