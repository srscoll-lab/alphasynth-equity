import { buildFcsEvidencePreflightSnapshot } from "../src/fcs-evidence-preflight.ts";

const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const requestedLimit = Number(limitArgument?.split("=")[1] || 25);
if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
  throw new Error("--limit must be an integer between 1 and 100.");
}

const snapshot = buildFcsEvidencePreflightSnapshot();
const candidates = snapshot.priorityBatch.records
  .filter((record) => record.status === "partial")
  .slice(0, requestedLimit);

// This command is intentionally planning-only. It makes zero provider calls.
// An executing collector must persist, per company, dated official current and
// comparable documents plus coverage of all four factor families before it may
// promote a record to high_probability.
console.log(JSON.stringify({
  mode: "dry_run_only",
  providerCallsMade: 0,
  companies: candidates.map(({ symbol, companyName, capSegment }) => ({ symbol, companyName, capSegment })),
  projectedUpperBound: {
    officialIndexOrSearchCalls: candidates.length,
    candidateDocumentFetches: candidates.length * 4,
    modelCalls: 0,
  },
  promotionRule: "No record becomes request-enabled unless official current/comparable documents and all four factor families are verified and persisted.",
}, null, 2));
