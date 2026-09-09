import fs from "node:fs";
import { normalizeAiTransitionAssessment } from "../src/ai-transition-schema";

const files = ["ai-transition-intellect-history.json", "ai-transition-tcs-history.json", "ai-transition-tataelxsi-history.json"];
const histories = files.map((file) => JSON.parse(fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).map(normalizeAiTransitionAssessment));
const rows = histories.flatMap((history) => history.map((item) =>
  `| ${item.symbol} | ${item.assessmentAsOf.slice(0, 4)} | ${item.exposure.score ?? "N/A"} | ${item.readiness.score ?? "N/A"} | ${item.classification} |`,
));
const markdown = [
  "# AI transition pilot — reconstructed histories",
  "",
  "> Reconstructed on 2026-09-09 from later-accessed official disclosures. This is explanatory calibration and is not eligible for an unbiased backtest.",
  "",
  "| Company | FY | Exposure | Readiness | Classification |",
  "| --- | --- | ---: | ---: | --- |",
  ...rows,
  "",
  "Platform revenue and AI-enabled engagements are not treated as AI revenue. Only TCS FY26 includes a separately disclosed annualized AI-revenue measure.",
  "",
].join("\n");
const directory = new URL("../output/ai-transition/", import.meta.url);
const output = new URL("pilot-history.md", directory);
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(output, markdown);
console.log(output.pathname);
