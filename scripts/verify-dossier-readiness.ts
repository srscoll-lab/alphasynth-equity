import assert from "node:assert/strict";
import { assessDossierReadiness } from "../src/dossier-readiness";

const claim = (id: string) => ({ claimId: id, text: `Supported claim ${id}`, sourceIds: ["official-001"], status: "supported" as const });
const factor = (id: string) => ({
  id,
  availability: "complete",
  previous: { metrics: [{ key: "metric", label: "Metric", value: 1 }] },
  current: { metrics: [{ key: "metric", label: "Metric", value: 2 }] },
});

const completePayload: any = {
  dossier: {
    sections: {
      snapshot: [claim("s1"), claim("s2"), claim("s3"), claim("s4")],
      developments: [claim("d1")],
      operatingEvidence: [claim("o1")],
      managementCommitments: [claim("m1")],
      risks: [claim("r1")],
    },
    sources: [
      { sourceId: "official-001", url: "https://example.com/result.pdf", sourceClass: "company_official" },
      { sourceId: "official-002", url: "https://example.com/annual-report.pdf", sourceClass: "company_official" },
    ],
    quarterlyPerformance: [],
  },
  financials: [{ period: "Q1", revenueCr: 10 }, { period: "Q2", revenueCr: 12 }],
  market: { priceHistory: [{ date: "2026-01-01", close: 100 }, { date: "2026-01-02", close: 101 }] },
  bms: { factorAnalysis: { factors: [factor("earnings"), factor("economics"), factor("balance_sheet")] } },
  deliveryCheck: {
    input: { qualityGates: [
      { result: "pass" }, { result: "pass" }, { result: "fail" }, { result: "unknown" },
    ] },
    assessment: { deliveryCoverage: 60, deliveryComponents: [{}, {}] },
  },
};

const ready = assessDossierReadiness(completePayload);
assert.equal(ready.ready, true);
assert.equal(ready.code, "DOSSIER_READY");

const sparsePayload: any = {
  ...completePayload,
  dossier: {
    ...completePayload.dossier,
    sections: {
      snapshot: [claim("s1"), claim("s2"), claim("s3"), claim("s4"), claim("s5")],
      developments: [], operatingEvidence: [], managementCommitments: [], risks: [],
    },
    sources: completePayload.dossier.sources.slice(0, 1),
  },
  bms: { factorAnalysis: { factors: [] } },
  deliveryCheck: {
    input: { qualityGates: [{ result: "unknown" }] },
    assessment: { deliveryCoverage: 0, deliveryComponents: [] },
  },
};

const blocked = assessDossierReadiness(sparsePayload);
assert.equal(blocked.ready, false);
assert.equal(blocked.code, "DOSSIER_EVIDENCE_INCOMPLETE");
assert.ok(blocked.reasons.some((reason) => reason.includes("company facts")));
assert.ok(blocked.reasons.some((reason) => reason.includes("report sections")));
assert.ok(blocked.reasons.some((reason) => reason.includes("BMS factors")));
assert.ok(blocked.reasons.some((reason) => reason.includes("business-quality checks")));

console.log("Dossier readiness gate verified.");
