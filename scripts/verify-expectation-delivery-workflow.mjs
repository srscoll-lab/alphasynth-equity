import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = JSON.parse(readFileSync("n8n/expectation-delivery-pilot-v1.json", "utf8"));
const manifest = JSON.parse(readFileSync("scripts/expectation-delivery-pilot-companies.json", "utf8"));
const http = workflow.nodes.find(node => node.name === "Apply Deterministic Overlay");

assert.equal(workflow.active, false, "Pilot workflow must remain inactive in source control.");
assert.ok(http, "Deterministic overlay HTTP node is required.");
assert.match(http.parameters.url, /ALPHASYNTH_INTERNAL_URL/);
assert.match(http.parameters.url, /expectation-delivery\/assess/);
assert.equal(http.parameters.specifyBody, "json");
assert.equal(http.parameters.jsonBody, "={{ $json }}");
assert.ok(JSON.stringify(http).includes("DOSSIER_INTERNAL_TOKEN"));
assert.ok(!JSON.stringify(workflow).match(/fc-[A-Za-z0-9_-]+/), "Workflow must not contain a Firecrawl key.");
assert.equal(manifest.companies.length, 5);
assert.deepEqual(new Set(manifest.companies.map(company => company.lifecycle)), new Set(["Watch", "Emerging", "Building", "Established", "Fading"]));
console.log("Expectation-delivery n8n workflow and five-company lifecycle pilot verified.");
