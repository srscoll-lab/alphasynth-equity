import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = JSON.parse(fs.readFileSync("n8n/official-source-admission-v1.json", "utf8"));
const code = workflow.nodes.find((node) => node.name === "Apply Official Source Policy").parameters.jsCode;
const run = new Function("$json", code);
const [result] = run({ body: {
  ticker: "TEST",
  information_cutoff: "2026-09-04",
  official_domains: ["example.com"],
  candidates: [
    { url: "https://example.com/report.pdf", published_at: "2026-09-01" },
    { url: "https://example.com.evil.test/report.pdf", published_at: "2026-09-01" },
    { url: "https://www.nseindia.com/filing.pdf", published_at: "2026-09-02" },
    { url: "https://example.com/future.pdf", published_at: "2026-09-05" },
  ],
} });

assert.equal(result.json.admitted.length, 2);
assert.equal(result.json.rejected.length, 2);
assert.deepEqual(result.json.rejected.map((item) => item.reason), ["unverified_domain", "post_cutoff"]);
assert.equal(result.json.admitted[0].source_class, "exchange");
console.log("PASS: n8n official-source admission policy");
