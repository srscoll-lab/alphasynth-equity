import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessManagementGuidanceDelivery,
  type CommentaryChange,
  type CommitmentDelivery,
  type ManagementGuidanceDeliveryInput,
} from "../src/management-guidance-delivery.ts";

type FixtureCommitment = {
  key: string;
  statements: Array<{ id: string; statedAt: string; targetDate: string | null; quality: number }>;
  commentary?: Array<{ id: string; observedAt: string; change: CommentaryChange; discipline: number }>;
  delivery?: Array<{ id: string; assessedAt: string; status: CommitmentDelivery; evidenced?: boolean; materialityWeight?: number }>;
};

type Fixture = {
  scenarioId: string;
  synthetic: true;
  description: string;
  symbol: string;
  asOfDate: string;
  commitments: FixtureCommitment[];
  expected: {
    score: number | null;
    band: string;
    confidence: string;
    uniqueCommitments: number;
    duplicateStatementsCollapsed: number;
    matured: number;
    pending: number;
    scorable: number;
  };
};

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "management-guidance");

function toInput(fixture: Fixture): ManagementGuidanceDeliveryInput {
  return {
    symbol: fixture.symbol,
    asOfDate: fixture.asOfDate,
    statements: fixture.commitments.flatMap(commitment => commitment.statements.map(row => ({
      statementId: row.id,
      commitmentKey: commitment.key,
      statement: `Synthetic commitment ${commitment.key}`,
      statedAt: row.statedAt,
      targetDate: row.targetDate,
      metric: commitment.key,
      specificity: row.quality,
      measurability: row.quality,
      deadlineClarity: row.quality,
      evidenceRefs: [`synthetic-${row.id}`],
    }))),
    commentary: fixture.commitments.flatMap(commitment => (commitment.commentary ?? []).map(row => ({
      observationId: row.id,
      commitmentKey: commitment.key,
      observedAt: row.observedAt,
      change: row.change,
      previousStatementId: null,
      currentStatementId: commitment.statements.at(-1)?.id ?? "synthetic",
      revisionTimeliness: row.discipline,
      explanationQuality: row.discipline,
      internalConsistency: row.discipline,
      evidenceRefs: [`synthetic-${row.id}`],
    }))),
    delivery: fixture.commitments.flatMap(commitment => (commitment.delivery ?? []).map(row => ({
      observationId: row.id,
      commitmentKey: commitment.key,
      assessedAt: row.assessedAt,
      status: row.status,
      explanation: `Synthetic ${row.status} observation`,
      evidenceRefs: row.evidenced === false ? [] : [`synthetic-${row.id}`],
      ...(row.materialityWeight === undefined ? {} : { materialityWeight: row.materialityWeight }),
    }))),
  };
}

const files = (await readdir(fixtureDirectory)).filter(name => name.endsWith(".json")).sort();
assert.ok(files.length >= 5 && files.length <= 10, `Expected 5-10 fixtures; found ${files.length}.`);

const summaries: object[] = [];
const failures: string[] = [];
const fixtures: Fixture[] = [];
for (const name of files) {
  const fixture = JSON.parse(await readFile(join(fixtureDirectory, name), "utf8")) as Fixture;
  fixtures.push(fixture);
  assert.equal(fixture.synthetic, true, `${name} must be explicitly marked synthetic.`);
  try {
    const result = assessManagementGuidanceDelivery(toInput(fixture));
    assert.equal(result.score, fixture.expected.score);
    assert.equal(result.band, fixture.expected.band);
    assert.equal(result.evidenceConfidence, fixture.expected.confidence);
    assert.equal(result.commitmentCounts.uniqueCommitments, fixture.expected.uniqueCommitments);
    assert.equal(result.commitmentCounts.duplicateStatementsCollapsed, fixture.expected.duplicateStatementsCollapsed);
    assert.equal(result.commitmentCounts.matured, fixture.expected.matured);
    assert.equal(result.commitmentCounts.pending, fixture.expected.pending);
    assert.equal(result.components.maturedDelivery.scorable, fixture.expected.scorable);
    summaries.push({ scenario: fixture.scenarioId, status: "pass", score: result.score, band: result.band, confidence: result.evidenceConfidence });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${fixture.scenarioId}: ${message}`);
    summaries.push({ scenario: fixture.scenarioId, status: "fail", error: message });
  }
}

function invariant(name: string, check: () => void) {
  try {
    check();
    summaries.push({ invariant: name, status: "pass" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    summaries.push({ invariant: name, status: "fail", error: message });
  }
}

const directionFixture = fixtures.find(row => row.scenarioId === "commentary-direction-neutrality");
assert.ok(directionFixture);
invariant("commentary direction is descriptive, not scored", () => {
  const original = assessManagementGuidanceDelivery(toInput(directionFixture));
  const changed = structuredClone(directionFixture);
  for (const commitment of changed.commitments) {
    for (const row of commitment.commentary ?? []) row.change = row.change === "raised" ? "contradicted" : "raised";
  }
  const alternate = assessManagementGuidanceDelivery(toInput(changed));
  assert.equal(alternate.score, original.score);
});

const repeatFixture = fixtures.find(row => row.scenarioId === "repeat-and-pending");
assert.ok(repeatFixture);
invariant("repeated promise is counted once", () => {
  const result = assessManagementGuidanceDelivery(toInput(repeatFixture));
  assert.equal(result.commitmentCounts.duplicateStatementsCollapsed, 1);
  assert.equal(result.commitmentCounts.uniqueCommitments, 4);
});

invariant("pending commitment creates no matured-delivery points", () => {
  const withPending = assessManagementGuidanceDelivery(toInput(repeatFixture));
  const withoutPendingFixture = structuredClone(repeatFixture);
  withoutPendingFixture.commitments = withoutPendingFixture.commitments.filter(row => row.key !== "future-launch");
  const withoutPending = assessManagementGuidanceDelivery(toInput(withoutPendingFixture));
  assert.equal(withPending.components.maturedDelivery.score, withoutPending.components.maturedDelivery.score);
  assert.equal(withPending.components.maturedDelivery.scorable, withoutPending.components.maturedDelivery.scorable);
  assert.equal(withPending.deliveryRecord.find(row => row.commitmentKey === "future-launch")?.status, "pending");
});

const lookAheadFixture = fixtures.find(row => row.scenarioId === "look-ahead-prevention");
assert.ok(lookAheadFixture);
invariant("post-asOf evidence is excluded", () => {
  const withFuture = assessManagementGuidanceDelivery(toInput(lookAheadFixture));
  const stripped = structuredClone(lookAheadFixture);
  for (const commitment of stripped.commitments) {
    commitment.statements = commitment.statements.filter(row => row.statedAt <= stripped.asOfDate);
    commitment.commentary = commitment.commentary?.filter(row => row.observedAt <= stripped.asOfDate);
    commitment.delivery = commitment.delivery?.filter(row => row.assessedAt <= stripped.asOfDate);
  }
  const withoutFuture = assessManagementGuidanceDelivery(toInput(stripped));
  assert.deepEqual(withFuture, withoutFuture);
});

console.log(JSON.stringify({ schemaVersion: "1.0.0", fixtures: files.length, passed: summaries.length - failures.length, failed: failures.length, results: summaries }, null, 2));
if (failures.length) {
  console.error(`Management-guidance pilot validation failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
}
