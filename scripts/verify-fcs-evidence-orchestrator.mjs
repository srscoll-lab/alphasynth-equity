import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = JSON.parse(await readFile(new URL("../n8n/fcs-evidence-orchestrator-v1.json", import.meta.url), "utf8"));
const names = new Set(workflow.nodes.map((node) => node.name));
for (const required of [
  "FCS Evidence Request", "Validate and Bound Request", "Get Tapetide Candidate Financials",
  "Attach Candidate Hints", "Verify Official Evidence with Gemini", "Preserve Evidence Outcome",
  "Return Evidence Contract",
]) assert(names.has(required), `Missing ${required}`);
assert.equal(workflow.active, false, "Pilot must remain inactive until credentialed smoke testing passes");
const webhook = workflow.nodes.find((node) => node.name === "FCS Evidence Request");
assert.equal(webhook?.webhookId, "alphasynth-fcs-evidence-v1", "Production webhook registration id is required");
const serialized = JSON.stringify(workflow);
assert(!/tpt_[a-z0-9]/i.test(serialized), "Tapetide token must not be exported");
assert(!/x-fundamental-review-token\"\s*:\s*\"[^=]/i.test(serialized), "Internal token must not be exported");
assert(serialized.includes("provider_financial_candidates"));
assert(serialized.includes("candidate_only"));
assert(serialized.includes("factor-evidence/research"));
console.log("Inactive n8n FCS candidate-to-official-evidence workflow verified.");
