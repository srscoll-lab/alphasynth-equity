import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = JSON.parse(fs.readFileSync("n8n/dossier-orchestrator-v1.json", "utf8"));
assert.equal(workflow.active, false);
assert.ok(workflow.nodes.some(node => node.name === "Validate Request"));
const research = workflow.nodes.find(node => node.name === "Build Official Evidence Dossier");
assert.ok(research.parameters.url.includes("ALPHASYNTH_INTERNAL_URL"));
assert.ok(JSON.stringify(research.parameters.headerParameters).includes("DOSSIER_INTERNAL_TOKEN"));
assert.ok(!JSON.stringify(workflow).match(/Bearer\s+[A-Za-z0-9._-]+/));
assert.equal(workflow.connections["Build Official Evidence Dossier"].main[0][0].node, "Return Dossier");
console.log("PASS: inactive dossier orchestrator contract");
