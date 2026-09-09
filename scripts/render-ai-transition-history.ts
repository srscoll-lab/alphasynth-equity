import fs from "node:fs";
import { normalizeAiTransitionAssessment } from "../src/ai-transition-schema";

const raw = JSON.parse(fs.readFileSync(new URL("./ai-transition-intellect-history.json", import.meta.url), "utf8"));
const history = raw.map(normalizeAiTransitionAssessment);
const rows = history.map((item) => {
  const metrics = item.operatingMetrics;
  return `| ${item.assessmentAsOf.slice(0, 4)} | ${item.exposure.score ?? "N/A"} | ${item.readiness.score ?? "N/A"} | ${item.classification} | ${metrics?.platformRevenue ?? "N/A"} | ${metrics?.ebitdaMarginPct ?? "N/A"}% |`;
});
const markdown = [
  "# Intellect Design Arena — reconstructed AI transition history",
  "",
  "> Reconstructed on 2026-09-09 from later-accessed official disclosures. This is explanatory calibration and is not eligible for an unbiased backtest.",
  "",
  "| FY | Exposure | Readiness | Classification | Platform revenue (INR Cr) | EBITDA margin |",
  "| --- | ---: | ---: | --- | ---: | ---: |",
  ...rows,
  "",
  "Platform revenue is not treated as AI revenue. The separately disclosed AI-revenue field remains unavailable for every year.",
  "",
].join("\n");
const directory = new URL("../output/ai-transition/", import.meta.url);
const output = new URL("intellect-history.md", directory);
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(output, markdown);
console.log(output.pathname);
