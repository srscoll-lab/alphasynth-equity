import assert from "node:assert/strict";
import { isOfficialDossierSource, isResearchDossier } from "../src/dossier";

assert.equal(isOfficialDossierSource("https://www.nseindia.com/test.pdf", []), true);
assert.equal(isOfficialDossierSource("https://investors.example.com/report.pdf", ["example.com"]), true);
assert.equal(isOfficialDossierSource("https://example.com.evil.test/report.pdf", ["example.com"]), false);
assert.equal(isOfficialDossierSource("http://example.com/report.pdf", ["example.com"]), false);

const dossier = {
  schemaVersion: "1.0.0",
  reportId: "pilot-1",
  generatedAt: "2026-09-04T00:00:00Z",
  company: { symbol: "TEST", name: "Test Ltd", exchange: "NSE", sector: "Test", officialDomains: ["example.com"] },
  sections: {
    snapshot: [{ claimId: "c1", text: "Supported fact", sourceIds: ["s1"], status: "supported" }],
    developments: [], operatingEvidence: [], managementCommitments: [], risks: [],
  },
  sources: [{ sourceId: "s1", url: "https://example.com/report.pdf", sourceClass: "company_official", publishedAt: "2026-09-01", retrievedAt: "2026-09-04T00:00:00Z" }],
  marketConversation: { status: "available", affectsBms: false, sampleSize: 3, sentiment: { positive: 0.34, neutral: 0.33, negative: 0.33 }, themes: [] },
  qualityControl: { unsupportedClaims: 0, conflicts: 0, humanReviewRequired: true },
};

assert.equal(isResearchDossier(dossier), true);
assert.equal(isResearchDossier({ ...dossier, marketConversation: { ...dossier.marketConversation, affectsBms: true } }), false);
assert.equal(isResearchDossier({ ...dossier, sources: [] }), false);
console.log("PASS: dossier trust and integrity controls");
