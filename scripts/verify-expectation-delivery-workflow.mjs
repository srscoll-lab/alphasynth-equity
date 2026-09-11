import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = JSON.parse(readFileSync("n8n/expectation-delivery-pilot-v1.json", "utf8"));
const manifest = JSON.parse(readFileSync("scripts/expectation-delivery-pilot-companies.json", "utf8"));
const http = workflow.nodes.find(node => node.name === "Apply Deterministic Overlay");
const management = workflow.nodes.find(node => node.name === "Analyse Management Guidance");
const fallback = workflow.nodes.find(node => node.name === "Preserve Unavailable Management Guidance");
const connectionTargets = name => workflow.connections[name]?.main?.[0]?.map(edge => edge.node) ?? [];

assert.equal(workflow.active, false, "Pilot workflow must remain inactive in source control.");
assert.ok(http, "Deterministic overlay HTTP node is required.");
assert.ok(management, "Management-guidance HTTP node is required.");
assert.ok(fallback, "Management-guidance fail-closed normalization node is required.");
assert.match(management.parameters.url, /ALPHASYNTH_INTERNAL_URL/);
assert.match(management.parameters.url, /management-guidance\/from-dossier/);
assert.equal(management.parameters.specifyBody, "json");
assert.equal(management.parameters.jsonBody, "={{ $json }}");
assert.equal(management.onError, "continueRegularOutput");
assert.equal(management.parameters.options.response.response.fullResponse, true);
assert.equal(management.parameters.options.response.response.neverError, true);
assert.ok(JSON.stringify(management.parameters.headerParameters).includes("x-dossier-token"));
assert.ok(JSON.stringify(management.parameters.headerParameters).includes("DOSSIER_INTERNAL_TOKEN"));
assert.match(fallback.parameters.jsCode, /managementGuidance/);
assert.match(fallback.parameters.jsCode, /status:'unavailable'/);
assert.match(fallback.parameters.jsCode, /evidenceRefs:\[\]/);
assert.match(fallback.parameters.jsCode, /Validate Assessment Input/);
assert.deepEqual(connectionTargets("Validate Assessment Input"), ["Analyse Management Guidance"]);
assert.deepEqual(connectionTargets("Analyse Management Guidance"), ["Preserve Unavailable Management Guidance"]);
assert.deepEqual(connectionTargets("Preserve Unavailable Management Guidance"), ["Apply Deterministic Overlay"]);
assert.deepEqual(connectionTargets("Apply Deterministic Overlay"), ["Return Assessment"]);

const validated = {
  dossier: { reportId: "TEST-1" },
  lifecycle: "Watch",
  lifecycleFreezeDate: "2026-08-25",
  expectationFreezeDate: "2026-09-11",
  sectorValuationPercentile: null,
};
const executeFallback = response => new Function("$json", "$", fallback.parameters.jsCode)(
  response,
  nodeName => {
    assert.equal(nodeName, "Validate Assessment Input");
    return { item: { json: validated } };
  },
)[0].json;

const successfulGuidance = { status: "available", commitments: [{ id: "commitment-1" }] };
assert.deepEqual(
  executeFallback({ statusCode: 200, body: { ...validated, managementGuidance: successfulGuidance } }),
  { ...validated, managementGuidance: successfulGuidance },
  "A valid management-guidance result should augment the validated assessment input.",
);
for (const response of [
  { statusCode: 503, body: { error: "unavailable" } },
  { statusCode: 200, body: { ...validated } },
  { error: "transport failure" },
]) {
  const result = executeFallback(response);
  assert.deepEqual(result.dossier, validated.dossier, "Fail-closed handling must preserve the validated dossier.");
  assert.equal(result.managementGuidance.status, "unavailable");
  assert.deepEqual(result.managementGuidance.evidenceRefs, []);
  assert.ok(result.managementGuidance.reason);
}
assert.match(http.parameters.url, /ALPHASYNTH_INTERNAL_URL/);
assert.match(http.parameters.url, /expectation-delivery\/from-dossier/);
assert.equal(http.parameters.specifyBody, "json");
assert.equal(http.parameters.jsonBody, "={{ $json }}");
assert.match(workflow.nodes.find(node => node.name === "Validate Assessment Input").parameters.jsCode, /dossier/);
assert.match(workflow.nodes.find(node => node.name === "Validate Assessment Input").parameters.jsCode, /lifecycleFreezeDate/);
assert.ok(JSON.stringify(http).includes("DOSSIER_INTERNAL_TOKEN"));
assert.ok(!JSON.stringify(workflow).match(/fc-[A-Za-z0-9_-]+/), "Workflow must not contain a Firecrawl key.");
assert.equal(manifest.companies.length, 5);
assert.deepEqual(new Set(manifest.companies.map(company => company.lifecycle)), new Set(["Watch", "Emerging", "Building", "Established", "Fading"]));
console.log("Expectation-delivery n8n workflow and five-company lifecycle pilot verified.");
