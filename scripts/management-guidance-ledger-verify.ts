import assert from "node:assert/strict";
import {
  GcsManagementGuidanceLedger,
  InMemoryManagementGuidanceLedger,
  ManagementGuidanceLedgerConflictError,
  createManagementGuidanceLedgerFromEnvironment,
  managementGuidanceLedgerInputErrors,
} from "../src/management-guidance-ledger.ts";
import type { ManagementGuidanceDeliveryInput } from "../src/management-guidance-delivery.ts";

const first: ManagementGuidanceDeliveryInput = {
  symbol: "TEST",
  asOfDate: "2026-06-30",
  statements: [{
    statementId: "s1", commitmentKey: "margin-fy26", statement: "Maintain margin", statedAt: "2025-06-01",
    targetDate: "2026-03-31", metric: "EBITDA margin", specificity: 0.8, measurability: 1, deadlineClarity: 1,
    evidenceRefs: ["official-001"],
  }],
  commentary: [],
  delivery: [],
};
const second: ManagementGuidanceDeliveryInput = {
  symbol: "TEST",
  asOfDate: "2026-09-30",
  statements: [{ ...first.statements[0], evidenceRefs: ["official-001", "official-002"] }],
  commentary: [{
    observationId: "c1", commitmentKey: "margin-fy26", observedAt: "2026-07-01", change: "maintained",
    previousStatementId: "s1", currentStatementId: "s1", revisionTimeliness: 1, explanationQuality: 0.8,
    internalConsistency: 1, evidenceRefs: ["official-002"],
  }],
  delivery: [{
    observationId: "d1", commitmentKey: "margin-fy26", assessedAt: "2026-07-01", status: "delivered",
    explanation: "Audited margin met target", evidenceRefs: ["official-002"],
  }],
};

const memory = new InMemoryManagementGuidanceLedger();
assert.deepEqual(await memory.read("TEST"), { status: "available", history: null, generation: null });
assert.equal((await memory.merge(first)).status, "saved");
const merged = await memory.merge(second);
assert.equal(merged.status, "saved");
if (merged.status !== "saved") throw new Error("Expected saved result");
assert.equal(merged.history.asOfDate, "2026-09-30");
assert.equal(merged.history.statements.length, 1, "same statement ID must be idempotent");
assert.deepEqual(merged.history.statements[0].evidenceRefs, ["official-001", "official-002"]);
assert.equal(merged.history.commentary.length, 1);
assert.equal(merged.history.delivery.length, 1);
assert.equal((await memory.merge(second)).status, "saved", "repeating an import must be idempotent");
await assert.rejects(
  () => memory.merge({ ...second, statements: [{ ...second.statements[0], statement: "Changed historical content" }] }),
  ManagementGuidanceLedgerConflictError,
);
assert.ok(managementGuidanceLedgerInputErrors({ ...first, asOfDate: "2026-02-30" }).some(error => error.includes("real calendar date")));
await assert.rejects(() => memory.read("test"), /canonical uppercase/);
assert.deepEqual(
  await createManagementGuidanceLedgerFromEnvironment({}).read("TEST"),
  { status: "unavailable", reason: "MANAGEMENT_GUIDANCE_LEDGER_BUCKET is not configured." },
);

type Stored = { generation: number; body: unknown };
let stored: Stored | null = null;
let conflictOnce = true;
const requestedUrls: string[] = [];
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  requestedUrls.push(url);
  if (url.includes("/storage/v1/") && !url.includes("/upload/") && !url.includes("alt=media")) {
    return stored
      ? Response.json({ generation: String(stored.generation) })
      : new Response("missing", { status: 404 });
  }
  if (url.includes("alt=media")) return Response.json(stored?.body);
  if (url.includes("/upload/storage/v1/")) {
    const expected = new URL(url).searchParams.get("ifGenerationMatch");
    if (conflictOnce) {
      conflictOnce = false;
      return new Response("contested", { status: 412 });
    }
    const actual = stored ? String(stored.generation) : "0";
    if (expected !== actual) return new Response("stale", { status: 412 });
    stored = { generation: (stored?.generation ?? 0) + 1, body: JSON.parse(String(init?.body)) };
    return Response.json({ generation: String(stored.generation) });
  }
  throw new Error(`Unexpected URL ${url}`);
};

const gcs = new GcsManagementGuidanceLedger({
  bucket: "test-ledger-bucket",
  prefix: "ledger/v1",
  fetch: fakeFetch,
  tokenProvider: async () => "test-token",
  now: () => new Date("2026-09-11T00:00:00.000Z"),
});
const gcsSaved = await gcs.merge(first);
assert.equal(gcsSaved.status, "saved");
if (gcsSaved.status !== "saved") throw new Error("Expected GCS save");
assert.equal(gcsSaved.attempts, 2, "HTTP 412 must trigger read-merge-write retry");
assert.ok(requestedUrls.some(url => url.includes("ifGenerationMatch=0")));
assert.equal((await gcs.read("TEST")).status, "available");

const unavailable = new GcsManagementGuidanceLedger({
  bucket: "test-ledger-bucket",
  fetch: async () => new Response("down", { status: 503 }),
  tokenProvider: async () => "test-token",
});
assert.deepEqual(await unavailable.read("TEST"), { status: "unavailable", reason: "GCS metadata read failed with HTTP 503." });

console.log("Management guidance ledger verification passed.");
