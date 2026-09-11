import assert from "node:assert/strict";
import {
  assessManagementGuidanceDelivery,
  managementGuidanceDeliveryInputErrors,
  MANAGEMENT_GUIDANCE_DELIVERY_RULES,
  type ManagementGuidanceDeliveryInput,
} from "../src/management-guidance-delivery.ts";

const statement = (id: string, key: string, statedAt: string, targetDate: string | null) => ({
  statementId: id,
  commitmentKey: key,
  statement: `${key} target`,
  statedAt,
  targetDate,
  metric: key,
  specificity: 1,
  measurability: 1,
  deadlineClarity: targetDate ? 1 : 0,
  evidenceRefs: [`source-${id}`],
});

const base: ManagementGuidanceDeliveryInput = {
  symbol: "TEST",
  asOfDate: "2026-09-11",
  statements: [
    statement("s1", "margin-fy26", "2025-07-01", "2026-03-31"),
    // Restating the same target must not create a second commitment or score weight.
    statement("s2", "margin-fy26", "2025-10-01", "2026-03-31"),
    statement("s3", "capacity-q1", "2025-08-01", "2026-06-30"),
    statement("s4", "debt-fy26", "2025-09-01", "2026-03-31"),
    statement("s5", "launch-fy27", "2026-07-01", "2027-03-31"),
  ],
  commentary: [
    { observationId: "c1", commitmentKey: "margin-fy26", observedAt: "2025-10-01", change: "maintained", previousStatementId: "s1", currentStatementId: "s2", revisionTimeliness: 1, explanationQuality: 1, internalConsistency: 1, evidenceRefs: ["source-s2"] },
    { observationId: "c2", commitmentKey: "capacity-q1", observedAt: "2026-01-01", change: "postponed", previousStatementId: "s3", currentStatementId: "s3", revisionTimeliness: 0.5, explanationQuality: 1, internalConsistency: 0.5, evidenceRefs: ["source-s3"] },
    { observationId: "c3", commitmentKey: "debt-fy26", observedAt: "2026-03-01", change: "maintained", previousStatementId: "s4", currentStatementId: "s4", revisionTimeliness: 1, explanationQuality: 1, internalConsistency: 1, evidenceRefs: ["source-s4"] },
    { observationId: "c4", commitmentKey: "launch-fy27", observedAt: "2026-07-01", change: "new", previousStatementId: null, currentStatementId: "s5", revisionTimeliness: 1, explanationQuality: 1, internalConsistency: 1, evidenceRefs: ["source-s5"] },
  ],
  delivery: [
    { observationId: "d1", commitmentKey: "margin-fy26", assessedAt: "2026-04-30", status: "delivered", explanation: "Target achieved", evidenceRefs: ["result-1"] },
    // A later assessment supersedes the earlier one; both must not be counted.
    { observationId: "d2", commitmentKey: "margin-fy26", assessedAt: "2026-05-15", status: "delivered", explanation: "Audited result confirmed", evidenceRefs: ["annual-1"] },
    { observationId: "d3", commitmentKey: "capacity-q1", assessedAt: "2026-07-31", status: "partial", explanation: "One of two lines commissioned", evidenceRefs: ["result-2"] },
    { observationId: "d4", commitmentKey: "debt-fy26", assessedAt: "2026-04-30", status: "missed", explanation: "Net debt rose", evidenceRefs: ["result-1"] },
    // A pending promise must never enter the matured-delivery score.
    { observationId: "d5", commitmentKey: "launch-fy27", assessedAt: "2026-08-01", status: "pending", explanation: null, evidenceRefs: ["source-s5"] },
  ],
};

assert.deepEqual(managementGuidanceDeliveryInputErrors(base), []);
const result = assessManagementGuidanceDelivery(base);
assert.equal(result.commitmentCounts.statementOccurrences, 5);
assert.equal(result.commitmentCounts.uniqueCommitments, 4);
assert.equal(result.commitmentCounts.duplicateStatementsCollapsed, 1);
assert.equal(result.commitmentCounts.matured, 3);
assert.equal(result.commitmentCounts.pending, 1);
assert.equal(result.components.maturedDelivery.score, 50);
assert.equal(result.components.maturedDelivery.scorable, 3);
assert.equal(result.components.revisionDiscipline.score, 91.7);
assert.equal(result.components.disclosureQuality.score, 100);
assert.equal(result.score, 63.3);
assert.equal(result.band, "mixed_delivery");
assert.equal(result.evidenceConfidence, "low");
assert.equal(result.currentCommentary.find(row => row.commitmentKey === "capacity-q1")?.change, "postponed");
assert.equal(result.deliveryRecord.find(row => row.commitmentKey === "launch-fy27")?.status, "pending");

const insufficient = assessManagementGuidanceDelivery({
  ...base,
  delivery: base.delivery.filter(row => row.commitmentKey === "margin-fy26"),
});
assert.equal(insufficient.score, null);
assert.equal(insufficient.band, "insufficient_history");
assert.equal(insufficient.evidenceConfidence, "insufficient");
assert.match(insufficient.reasons[0], /At least 3/);

const unverifiable = assessManagementGuidanceDelivery({
  ...base,
  delivery: [
    ...base.delivery.filter(row => row.commitmentKey !== "debt-fy26"),
    { observationId: "d6", commitmentKey: "debt-fy26", assessedAt: "2026-04-30", status: "unverifiable", explanation: "No comparable disclosure", evidenceRefs: [] },
  ],
});
assert.equal(unverifiable.score, null);
assert.equal(unverifiable.components.maturedDelivery.unverifiable, 1);

assert.ok(managementGuidanceDeliveryInputErrors({ ...base, statements: [{ ...base.statements[0], specificity: 2 }] }).length > 0);
assert.ok(managementGuidanceDeliveryInputErrors({
  ...base,
  commentary: [{ ...base.commentary[0], change: "optimistic" as never }],
}).some(error => error.includes("change is invalid")));
assert.ok(managementGuidanceDeliveryInputErrors({
  ...base,
  delivery: [{ ...base.delivery[0], status: "probably" as never }],
}).some(error => error.includes("status is invalid")));
assert.match(MANAGEMENT_GUIDANCE_DELIVERY_RULES.deduplication, /never create additional scoring weight/);
assert.match(MANAGEMENT_GUIDANCE_DELIVERY_RULES.maturity, /Pending commitments are not scored/);

console.log("Management guidance and delivery contract verification passed.");
