import assert from "node:assert/strict";
import { isOfficialDossierSource, isResearchDossier } from "../src/dossier.ts";
import { dossierCompanyProfile } from "../src/dossier-companies.ts";

assert.equal(isOfficialDossierSource("https://www.nseindia.com/test.pdf", []), true);
assert.equal(isOfficialDossierSource("https://investors.example.com/report.pdf", ["example.com"]), true);
assert.equal(isOfficialDossierSource("https://example.com.evil.test/report.pdf", ["example.com"]), false);
assert.equal(isOfficialDossierSource("http://example.com/report.pdf", ["example.com"]), false);
assert.deepEqual(dossierCompanyProfile(" infy ")?.officialDomains, ["infosys.com"]);
assert.deepEqual(dossierCompanyProfile("RELIANCE")?.officialDomains, ["ril.com"]);
assert.deepEqual(dossierCompanyProfile("BAJAJ-AUTO")?.officialDomains, ["bajajauto.com"]);
assert.deepEqual(dossierCompanyProfile("TITAN")?.officialDomains, ["titancompany.in"]);
assert.equal(dossierCompanyProfile("UNKNOWN"), null);

const dossier = {
  schemaVersion: "1.0.0",
  reportId: "pilot-1",
  generatedAt: "2026-09-04T00:00:00Z",
  company: { symbol: "TEST", name: "Test Ltd", exchange: "NSE", sector: "Test", officialDomains: ["example.com"] },
  sections: {
    snapshot: [{ claimId: "c1", text: "Supported fact", sourceIds: ["s1"], status: "supported" }],
    developments: [], operatingEvidence: [], managementCommitments: [], risks: [],
  },
  quarterlyPerformance: [{
    period: "Q1 FY27", basis: "consolidated", revenueCr: 100, ebitdaCr: 20,
    ebitdaMarginPct: 20, patCr: 12, eps: 2.4, sourceIds: ["s1"],
  }],
  sources: [{ sourceId: "s1", url: "https://example.com/report.pdf", sourceClass: "company_official", publishedAt: "2026-09-01", retrievedAt: "2026-09-04T00:00:00Z" }],
  marketConversation: { status: "available", affectsBms: false, sampleSize: 3, sentiment: { positive: 0.34, neutral: 0.33, negative: 0.33 }, themes: [] },
  qualityControl: { unsupportedClaims: 0, conflicts: 0, humanReviewRequired: true },
};

assert.equal(isResearchDossier(dossier), true);
assert.equal(isResearchDossier({ ...dossier, marketConversation: { ...dossier.marketConversation, affectsBms: true } }), false);
assert.equal(isResearchDossier({ ...dossier, sources: [] }), false);
assert.equal(isResearchDossier({
  ...dossier,
  quarterlyPerformance: [{ ...dossier.quarterlyPerformance[0], sourceIds: ["missing"] }],
}), false);
console.log("PASS: dossier trust and integrity controls");
