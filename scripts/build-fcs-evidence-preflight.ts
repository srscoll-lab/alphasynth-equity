import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildFcsEvidencePreflightSnapshot } from "../src/fcs-evidence-preflight.ts";

const outputPath = resolve(process.argv[2] || "src/data/fcsEvidencePreflight.json");
const snapshot = buildFcsEvidencePreflightSnapshot();
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, ...snapshot.summary }, null, 2));
