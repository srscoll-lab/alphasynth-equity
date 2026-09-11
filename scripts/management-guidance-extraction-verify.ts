import assert from "node:assert/strict";
import {
  buildManagementGuidanceGeminiRequest,
  normalizeManagementGuidanceExtraction,
  stableCommitmentKey,
  type GeminiManagementGuidanceExtraction,
  type ManagementGuidanceExtractionRequest,
} from "../src/management-guidance-extraction.ts";

const source = (sourceId: string, publishedAt: string) => ({ sourceId, publishedAt, url: `https://example.com/${sourceId}.pdf`, title: sourceId, text: `Official evidence ${sourceId}` });
const request: ManagementGuidanceExtractionRequest = {
  symbol: "TESTCO", asOfDate: "2026-09-11",
  evidenceDocuments: [source("official-q1", "2025-07-20"), source("official-q2", "2025-10-20"), source("official-fy", "2026-05-20"), source("official-new", "2026-08-01")],
  priorLedger: {
    symbol: "TESTCO", asOfDate: "2026-09-11",
    statements: [{ statementId: "prior-revenue", commitmentKey: "testco:revenue:existing", statement: "Revenue growth of 10% in FY26", statedAt: "2025-07-20", targetDate: "2026-03-31", metric: "revenue growth", specificity: 1, measurability: 1, deadlineClarity: 1, evidenceRefs: ["official-q1"] }],
    commentary: [], delivery: [],
  },
};

const commitment = (candidateId: string, existingCommitmentKey: string | null, statedAt: string, targetDate: string | null, evidenceRef: string) => ({
  candidateId, identity: { topic: "FY26 revenue outlook", metric: "revenue growth", scope: "consolidated", targetPeriod: "FY2026" }, existingCommitmentKey,
  statement: `${candidateId} statement`, statedAt, targetDate, metric: "revenue growth", specificity: 1, measurability: 1, deadlineClarity: targetDate ? 1 : 0, evidenceRefs: [evidenceRef],
});
const commentary = (candidateId: string, commitmentCandidateId: string, change: GeminiManagementGuidanceExtraction["commentary"][number]["change"], previousStatementId: string | null, evidenceRef: string, observedAt = "2025-10-20") => ({
  candidateId, commitmentCandidateId, change, observedAt, previousStatementId, revisionTimeliness: 1, explanationQuality: 1, internalConsistency: 1, evidenceRefs: [evidenceRef],
});
const delivery = (candidateId: string, commitmentCandidateId: string, status: GeminiManagementGuidanceExtraction["delivery"][number]["status"], basis: GeminiManagementGuidanceExtraction["delivery"][number]["basis"], targetEvidence = "official-fy", assessedAt = "2026-05-20") => ({
  candidateId, commitmentCandidateId, assessedAt, status, basis, explanation: basis === "explicit_outcome" ? `${status} explicitly reported` : null, materialityWeight: 1, evidenceRefs: [targetEvidence],
});

const payload: GeminiManagementGuidanceExtraction = {
  schemaVersion: "1.0.0",
  commitments: [
    commitment("maintained", "testco:revenue:existing", "2025-10-20", "2026-03-31", "official-q2"),
    { ...commitment("raised", null, "2025-10-20", "2026-03-31", "official-q2"), identity: { topic: "margin outlook", metric: "EBITDA margin", scope: "consolidated", targetPeriod: "FY2026" } },
    { ...commitment("lowered", null, "2025-10-20", "2026-03-31", "official-q2"), identity: { topic: "volume outlook", metric: "volume growth", scope: "India", targetPeriod: "FY2026" } },
    { ...commitment("postponed", null, "2025-10-20", "2026-06-30", "official-q2"), identity: { topic: "plant commissioning", metric: "capacity", scope: "Plant A", targetPeriod: "Q1 FY2027" } },
    { ...commitment("future", null, "2026-08-01", "2027-03-31", "official-new"), identity: { topic: "new product", metric: null, scope: "India", targetPeriod: "FY2027" } },
  ],
  commentary: [
    commentary("c-maintained", "maintained", "maintained", "prior-revenue", "official-q2"),
    commentary("c-raised", "raised", "raised", "prior-margin", "official-q2"),
    commentary("c-lowered", "lowered", "lowered", "prior-volume", "official-q2"),
    commentary("c-postponed", "postponed", "postponed", "prior-capacity", "official-q2"),
    commentary("c-new", "future", "new", null, "official-new", "2026-08-01"),
  ],
  delivery: [
    delivery("d-delivered", "maintained", "delivered", "explicit_outcome"),
    delivery("d-partial", "raised", "partial", "explicit_outcome"),
    delivery("d-missed", "lowered", "missed", "explicit_outcome"),
    delivery("d-unverifiable", "postponed", "unverifiable", "no_verifiable_outcome"),
    delivery("d-pending", "future", "pending", "pending_target", "official-new", "2026-08-01"),
    delivery("d-silence-miss", "postponed", "missed", "no_verifiable_outcome"),
    { ...delivery("d-hallucinated", "maintained", "delivered", "explicit_outcome"), evidenceRefs: ["unknown-source"] },
  ],
};

const geminiRequest = buildManagementGuidanceGeminiRequest(request);
assert.equal(geminiRequest.generationConfig.responseMimeType, "application/json");
assert.equal(geminiRequest.generationConfig.temperature, 0);
assert.match(geminiRequest.systemInstruction, /Never infer missed delivery from silence/);

const result = normalizeManagementGuidanceExtraction(request, payload);
assert.equal(result.statements.length, 5);
assert.deepEqual(result.commentary.map(row => row.change), ["maintained", "raised", "lowered", "postponed", "new"]);
assert.deepEqual(result.delivery.map(row => row.status), ["delivered", "partial", "missed", "unverifiable", "pending"]);
assert.ok(result.rejected.some(row => row.candidateId === "d-silence-miss" && /Silence/.test(row.reason)));
assert.ok(result.rejected.some(row => row.candidateId === "d-hallucinated" && /Unknown evidence/.test(row.reason)));
assert.equal(result.statements[0].commitmentKey, "testco:revenue:existing");
assert.equal(result.mergedLedger.statements.length, 6);

const identity = { topic: "Plant commissioning", metric: "Capacity", scope: "Plant A", targetPeriod: "Q1 FY2027" };
assert.equal(stableCommitmentKey("TESTCO", identity), stableCommitmentKey("testco", { topic: "plant commissioning", metric: "capacity", scope: "plant-a", targetPeriod: "q1 fy2027" }));

const malformed = normalizeManagementGuidanceExtraction(request, { schemaVersion: "1.0.0" });
assert.equal(malformed.statements.length, 0);
assert.equal(malformed.rejected.length, 3);

console.log("Management guidance extraction verification passed.");
