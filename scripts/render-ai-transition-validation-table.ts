import fs from "node:fs";

type Company = {
  symbol: string;
  companyName: string;
  cohort: string;
  assessmentAsOf: string;
  exposureScore: number;
  readinessScore: number;
  fy26ReturnPct: number;
  q1fy27ReturnPct: number;
  evidenceSummary: string;
  officialSource: string;
};

const input = JSON.parse(fs.readFileSync(new URL("./ai-transition-ten-company-validation.json", import.meta.url), "utf8"));
const companies: Company[] = input.companies;
const benchmark = input.benchmarkReturnsPct;

function ranks(values: number[]) {
  return values.map((value) => {
    const sorted = [...values].sort((a, b) => a - b);
    const first = sorted.indexOf(value);
    const last = sorted.lastIndexOf(value);
    return (first + last) / 2 + 1;
  });
}

function pearson(left: number[], right: number[]) {
  const lMean = left.reduce((a, b) => a + b, 0) / left.length;
  const rMean = right.reduce((a, b) => a + b, 0) / right.length;
  const covariance = left.reduce((sum, value, index) => sum + (value - lMean) * (right[index] - rMean), 0);
  const lVariance = left.reduce((sum, value) => sum + (value - lMean) ** 2, 0);
  const rVariance = right.reduce((sum, value) => sum + (value - rMean) ** 2, 0);
  return covariance / Math.sqrt(lVariance * rVariance);
}

function spearman(left: number[], right: number[]) {
  return pearson(ranks(left), ranks(right));
}

const rows = companies.map((company) => ({
  ...company,
  transitionGap: Math.round((company.readinessScore - company.exposureScore) * 10) / 10,
  fy26RelativePct: Math.round((company.fy26ReturnPct - benchmark.fy26) * 10) / 10,
  q1fy27RelativePct: Math.round((company.q1fy27ReturnPct - benchmark.q1fy27) * 10) / 10,
}));

const correlations = {
  fy26: {
    exposure: spearman(rows.map((row) => row.exposureScore), rows.map((row) => row.fy26RelativePct)),
    readiness: spearman(rows.map((row) => row.readinessScore), rows.map((row) => row.fy26RelativePct)),
    transitionGap: spearman(rows.map((row) => row.transitionGap), rows.map((row) => row.fy26RelativePct)),
  },
  q1fy27: {
    exposure: spearman(rows.map((row) => row.exposureScore), rows.map((row) => row.q1fy27RelativePct)),
    readiness: spearman(rows.map((row) => row.readinessScore), rows.map((row) => row.q1fy27RelativePct)),
    transitionGap: spearman(rows.map((row) => row.transitionGap), rows.map((row) => row.q1fy27RelativePct)),
  },
};

const number = (value: number) => value.toFixed(1);
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
const markdown = `# AI transition: preliminary 10-company validation

Generated as of ${input.generatedAsOf}. Scores are **reconstructed today** from dated official disclosures. They are provisional research measurements, not investment recommendations.

| Company | Cohort | Exposure | Readiness | Readiness − exposure | FY26 return | vs NIFTY IT | Q1 FY27 return | vs NIFTY IT |
|---|---|---:|---:|---:|---:|---:|---:|---:|
${rows.map((row) => `| ${row.companyName} (${row.symbol}) | ${row.cohort} | ${number(row.exposureScore)} | ${number(row.readinessScore)} | ${number(row.transitionGap)} | ${signed(row.fy26ReturnPct)} | ${signed(row.fy26RelativePct)} | ${signed(row.q1fy27ReturnPct)} | ${signed(row.q1fy27RelativePct)} |`).join("\n")}

Benchmark: NIFTY IT returned ${signed(benchmark.fy26)} in FY26 and ${signed(benchmark.q1fy27)} in Q1 FY27.

## What the table says

- The dispersion is real: Intellect and Coforge strongly outperformed NIFTY IT in Q1 FY27, while Infosys and HCLTech underperformed.
- Readiness alone did not rank winners reliably. Spearman rank correlation between readiness and relative return was ${correlations.fy26.readiness.toFixed(2)} for FY26 and ${correlations.q1fy27.readiness.toFixed(2)} for Q1 FY27.
- The readiness-minus-exposure gap also lacked a stable same-period relationship (${correlations.fy26.transitionGap.toFixed(2)} in FY26; ${correlations.q1fy27.transitionGap.toFixed(2)} in Q1 FY27).
- This does **not** invalidate the operating-risk framework. It says price recognition also depends on delivery, valuation, expectations and timing.

## Important validity limit

The FY26 assessments were published in April–June 2026, after FY26 price performance had occurred. Even the Q1 FY27 window partly predates several assessment dates. These comparisons are descriptive and must not be presented as predictive validation.

A valid next test is: reconstruct each company’s FY25 score using only evidence available on its FY25 publication date, freeze it, then measure subsequent FY26 relative return. FY26 scores can similarly be tested from each publication date forward.

## Evidence anchors

${rows.map((row) => `- **${row.symbol} (${row.assessmentAsOf})** — ${row.evidenceSummary} [Official source](${row.officialSource})`).join("\n")}
`;

const csvHeader = ["symbol", "companyName", "cohort", "assessmentAsOf", "exposureScore", "readinessScore", "transitionGap", "fy26ReturnPct", "fy26RelativePct", "q1fy27ReturnPct", "q1fy27RelativePct"];
const csv = [csvHeader.join(","), ...rows.map((row) => csvHeader.map((key) => JSON.stringify((row as any)[key])).join(","))].join("\n");
const output = new URL("../output/ai-transition/", import.meta.url);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(new URL("ten-company-validation.md", output), markdown);
fs.writeFileSync(new URL("ten-company-validation.csv", output), csv);
fs.writeFileSync(new URL("ten-company-validation-statistics.json", output), JSON.stringify({ correlations, benchmark, returnWindows: input.returnWindows }, null, 2));
console.log(JSON.stringify({ companies: rows.length, correlations, outputs: ["ten-company-validation.md", "ten-company-validation.csv", "ten-company-validation-statistics.json"] }, null, 2));
