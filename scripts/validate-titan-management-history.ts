import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessManagementGuidanceDelivery,
  managementGuidanceDeliveryInputErrors,
  type ManagementGuidanceDeliveryInput,
} from "../src/management-guidance-delivery.ts";

type Fixture = {
  schemaVersion: "1.0.0";
  assessmentMode: "reconstructed_today";
  reconstructedAt: string;
  purpose: string;
  sources: Array<{ sourceId: string; title: string; publishedAt: string; url: string; pages: number[] }>;
  judgementNotes: string[];
  input: ManagementGuidanceDeliveryInput;
  expected: {
    score: number;
    band: string;
    confidence: string;
    statementOccurrences: number;
    uniqueCommitments: number;
    duplicateStatementsCollapsed: number;
    matured: number;
    pending: number;
    scorable: number;
  };
};

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "management-guidance-history",
  "titan-fy25-reconstructed-today.json",
);
const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;

assert.equal(fixture.assessmentMode, "reconstructed_today");
assert.match(fixture.purpose, /never be merged into the live GCS ledger/i);
assert.ok(fixture.sources.length >= 2);
assert.ok(fixture.sources.every(source => source.url.startsWith("https://www.titancompany.in/")));
assert.deepEqual(managementGuidanceDeliveryInputErrors(fixture.input), []);

const result = assessManagementGuidanceDelivery(fixture.input);
assert.equal(result.score, fixture.expected.score);
assert.equal(result.band, fixture.expected.band);
assert.equal(result.evidenceConfidence, fixture.expected.confidence);
assert.equal(result.commitmentCounts.statementOccurrences, fixture.expected.statementOccurrences);
assert.equal(result.commitmentCounts.uniqueCommitments, fixture.expected.uniqueCommitments);
assert.equal(result.commitmentCounts.duplicateStatementsCollapsed, fixture.expected.duplicateStatementsCollapsed);
assert.equal(result.commitmentCounts.matured, fixture.expected.matured);
assert.equal(result.commitmentCounts.pending, fixture.expected.pending);
assert.equal(result.components.maturedDelivery.scorable, fixture.expected.scorable);
assert.equal(result.deliveryRecord.filter(row => row.status === "delivered").length, 1);
assert.equal(result.deliveryRecord.filter(row => row.status === "missed").length, 3);

console.log(JSON.stringify({
  assessmentMode: fixture.assessmentMode,
  reconstructedAt: fixture.reconstructedAt,
  sourcePolicy: "official_titan_only",
  persistence: "offline_fixture_only",
  result,
  judgementNotes: fixture.judgementNotes,
}, null, 2));
