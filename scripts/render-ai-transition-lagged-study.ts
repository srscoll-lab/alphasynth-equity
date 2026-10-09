import fs from "node:fs";

type Scores = Record<string, number | null>;
type Company = {
  symbol: string; companyName: string; cohort: string; assessmentAsOf: string;
  exposure: Scores; readiness: Scores; startClose: number; endClose: number;
  evidenceSummary: string; officialSource: string;
};

const input = JSON.parse(fs.readFileSync(new URL("./ai-transition-fy25-lagged-validation.json", import.meta.url), "utf8"));
const companies: Company[] = input.companies;

function weightedScore(scores: Scores, weights: Record<string, number>) {
  let weighted = 0;
  let coverage = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const value = scores[key];
    if (typeof value === "number") { weighted += value * weight; coverage += weight; }
  }
  return { score: Math.round(weighted / coverage * 10) / 10, coverage: Math.round(coverage * 100) };
}

function ranks(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((value) => (sorted.indexOf(value) + sorted.lastIndexOf(value)) / 2 + 1);
}
function pearson(a: number[], b: number[]) {
  const am = a.reduce((x, y) => x + y, 0) / a.length;
  const bm = b.reduce((x, y) => x + y, 0) / b.length;
  const numerator = a.reduce((sum, value, index) => sum + (value - am) * (b[index] - bm), 0);
  return numerator / Math.sqrt(a.reduce((sum, value) => sum + (value - am) ** 2, 0) * b.reduce((sum, value) => sum + (value - bm) ** 2, 0));
}
const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));
const pctReturn = (start: number, end: number) => Math.round(((end / start) - 1) * 1000) / 10;

function permutationPValue(left: number[], right: number[], iterations = 50000) {
  const observed = Math.abs(spearman(left, right));
  let seed = 20260909;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let extreme = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const shuffled = [...right];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    if (Math.abs(spearman(left, shuffled)) >= observed) extreme += 1;
  }
  return (extreme + 1) / (iterations + 1);
}

const benchmarkReturn = pctReturn(input.benchmark.startClose, input.benchmark.endClose);
const rows = companies.map((company) => {
  const exposure = weightedScore(company.exposure, input.methodology.exposureWeights);
  const readiness = weightedScore(company.readiness, input.methodology.readinessWeights);
  const absoluteReturn = pctReturn(company.startClose, company.endClose);
  return {
    ...company, exposureScore: exposure.score, exposureCoveragePct: exposure.coverage,
    readinessScore: readiness.score, readinessCoveragePct: readiness.coverage,
    transitionGap: Math.round((readiness.score - exposure.score) * 10) / 10,
    absoluteReturn, relativeReturn: Math.round((absoluteReturn - benchmarkReturn) * 10) / 10,
  };
});
const correlations = {
  exposureVsRelativeReturn: spearman(rows.map(r => r.exposureScore), rows.map(r => r.relativeReturn)),
  readinessVsRelativeReturn: spearman(rows.map(r => r.readinessScore), rows.map(r => r.relativeReturn)),
  transitionGapVsRelativeReturn: spearman(rows.map(r => r.transitionGap), rows.map(r => r.relativeReturn)),
};
const pValues = {
  exposureVsRelativeReturn: permutationPValue(rows.map(r => r.exposureScore), rows.map(r => r.relativeReturn)),
  readinessVsRelativeReturn: permutationPValue(rows.map(r => r.readinessScore), rows.map(r => r.relativeReturn)),
  transitionGapVsRelativeReturn: permutationPValue(rows.map(r => r.transitionGap), rows.map(r => r.relativeReturn)),
};
const readinessMedian = [...rows.map(r => r.readinessScore)].sort((a, b) => a - b).slice(4, 6).reduce((a, b) => a + b, 0) / 2;
const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const medianSplit = {
  threshold: readinessMedian,
  highReadinessAverageRelativeReturn: average(rows.filter(r => r.readinessScore > readinessMedian).map(r => r.relativeReturn)),
  lowReadinessAverageRelativeReturn: average(rows.filter(r => r.readinessScore < readinessMedian).map(r => r.relativeReturn)),
};
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
const md = `# Indian IT AI-transition study — lagged 10-company test

## Study design

- **Question:** Did companies that appeared more AI-ready by FY25 subsequently outperform an IT-sector benchmark?
- **Scores:** reconstructed today, using only official disclosures dated on or before 2 June 2025.
- **Outcome window:** ${input.returnStart} to ${input.returnEnd}; identical for every company and after every assessment date.
- **Benchmark:** ${input.benchmark.label}; return ${signed(benchmarkReturn)}.
- **Price basis:** closing-price return, excluding dividends. Source: [${input.priceSource.label}](https://www.equitypandit.com/historical-data/ITBEES).

| Company | Cohort | Exposure | Readiness | Gap | Subsequent return | vs ITBEES |
|---|---|---:|---:|---:|---:|---:|
${rows.map(r => `| ${r.companyName} (${r.symbol}) | ${r.cohort} | ${r.exposureScore.toFixed(1)} | ${r.readinessScore.toFixed(1)} | ${r.transitionGap.toFixed(1)} | ${signed(r.absoluteReturn)} | ${signed(r.relativeReturn)} |`).join("\n")}

## Result

| Tested relationship | Spearman rank correlation | Permutation p-value |
|---|---:|---:|
| Exposure vs subsequent relative return | ${correlations.exposureVsRelativeReturn.toFixed(2)} | ${pValues.exposureVsRelativeReturn.toFixed(2)} |
| Readiness vs subsequent relative return | ${correlations.readinessVsRelativeReturn.toFixed(2)} | ${pValues.readinessVsRelativeReturn.toFixed(2)} |
| Readiness − exposure vs subsequent relative return | ${correlations.transitionGapVsRelativeReturn.toFixed(2)} | ${pValues.transitionGapVsRelativeReturn.toFixed(2)} |

The high-readiness half returned an average ${signed(medianSplit.highReadinessAverageRelativeReturn)} relative to ITBEES, versus ${signed(medianSplit.lowReadinessAverageRelativeReturn)} for the low-readiness half. This difference is dominated by individual-company dispersion and is not statistically reliable.

The central thesis is **not validated as a stand-alone price-ranking rule** in this small sample. None of the permutation tests approaches conventional statistical significance. Higher reconstructed FY25 readiness did not reliably correspond to stronger subsequent relative returns, and the transition gap was not a dependable ranking signal.

This does not make the framework useless. It is more defensible as an **operating-risk and investigation framework** than as a direct price forecast. Market returns also reflect starting valuation, earnings revisions, deal conversion, vertical demand, company-specific events and expectations already embedded in price.

## Company evidence anchors

${rows.map(r => `- **${r.symbol} — ${r.exposureScore.toFixed(1)} exposure / ${r.readinessScore.toFixed(1)} readiness:** ${r.evidenceSummary} [Official disclosure](${r.officialSource})`).join("\n")}

## Decision

1. Keep the AI-transition module, but do not market readiness as a proven return predictor.
2. Present exposure and readiness as prompts for further investigation, alongside BMS operating delivery and valuation.
3. Freeze future assessments prospectively before observing returns. Do not reconstruct them after the fact.
4. Track 3-, 6- and 12-month sector-relative outcomes and earnings revisions. Expand the universe only after two or more prospective observation cycles.
5. The next composite hypothesis should test **readiness × delivery − exposure**, with valuation kept as a separate conditioning variable. Do not tune weights to this ten-company result.

## Limitations

- Ten companies and one outcome window are insufficient for statistical proof.
- Scores were reconstructed today; disciplined source cutoffs reduce, but do not eliminate, hindsight judgment.
- ITBEES is an investable proxy for NIFTY IT, not the index itself.
- Closing-price returns exclude dividends and transaction costs.
- Correlation measures association, not causation.
`;

const csvKeys = ["symbol", "companyName", "cohort", "assessmentAsOf", "exposureScore", "exposureCoveragePct", "readinessScore", "readinessCoveragePct", "transitionGap", "startClose", "endClose", "absoluteReturn", "relativeReturn"];
const csv = [csvKeys.join(","), ...rows.map(row => csvKeys.map(key => JSON.stringify((row as any)[key])).join(","))].join("\n");
const output = new URL("../output/ai-transition/", import.meta.url);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(new URL("ten-company-lagged-study.md", output), md);
fs.writeFileSync(new URL("ten-company-lagged-study.csv", output), csv);
fs.writeFileSync(new URL("ten-company-lagged-study-results.json", output), JSON.stringify({ benchmarkReturn, correlations, pValues, medianSplit, rows }, null, 2));
console.log(JSON.stringify({ benchmarkReturn, correlations, pValues, medianSplit, companies: rows.length }, null, 2));
