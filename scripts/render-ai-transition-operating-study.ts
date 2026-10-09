import fs from "node:fs";

type Company = {
  symbol: string; companyName: string; cohort: string;
  exposureScore: number; readinessScore: number;
  revenueGrowthPct: number; revenueBasis: string;
  marginChangePp: number; marginBasis: string;
  fy25Source: string; fy26Source: string;
};

const input = JSON.parse(fs.readFileSync(new URL("./ai-transition-operating-delivery.json", import.meta.url), "utf8"));
const companies: Company[] = input.companies;

function ranks(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map(value => (sorted.indexOf(value) + sorted.lastIndexOf(value)) / 2 + 1);
}
function pearson(a: number[], b: number[]) {
  const am = a.reduce((x, y) => x + y, 0) / a.length;
  const bm = b.reduce((x, y) => x + y, 0) / b.length;
  const numerator = a.reduce((sum, value, index) => sum + (value - am) * (b[index] - bm), 0);
  const denominator = Math.sqrt(a.reduce((sum, value) => sum + (value - am) ** 2, 0) * b.reduce((sum, value) => sum + (value - bm) ** 2, 0));
  return numerator / denominator;
}
const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));

function permutationPValue(left: number[], right: number[], iterations = 50000) {
  const observed = Math.abs(spearman(left, right));
  let seed = 20260909;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
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

const revenueRanks = ranks(companies.map(c => c.revenueGrowthPct));
const marginRanks = ranks(companies.map(c => c.marginChangePp));
const rows = companies.map((company, index) => ({
  ...company,
  transitionGap: Math.round((company.readinessScore - company.exposureScore) * 10) / 10,
  managedReadiness: Math.round(company.readinessScore * (100 - company.exposureScore)) / 100,
  deliveryIndex: Math.round((((revenueRanks[index] + marginRanks[index]) / 2 - 1) / (companies.length - 1)) * 1000) / 10,
}));

const delivery = rows.map(r => r.deliveryIndex);
const tests = {
  readinessVsDelivery: rows.map(r => r.readinessScore),
  exposureVsDelivery: rows.map(r => r.exposureScore),
  transitionGapVsDelivery: rows.map(r => r.transitionGap),
  managedReadinessVsDelivery: rows.map(r => r.managedReadiness),
};
const correlations = Object.fromEntries(Object.entries(tests).map(([key, values]) => [key, spearman(values, delivery)]));
const pValues = Object.fromEntries(Object.entries(tests).map(([key, values]) => [key, permutationPValue(values, delivery)]));
const exposureReadinessCorrelation = spearman(rows.map(r => r.exposureScore), rows.map(r => r.readinessScore));

const labels: Record<string, string> = {
  readinessVsDelivery: "Readiness vs operating delivery",
  exposureVsDelivery: "Exposure vs operating delivery",
  transitionGapVsDelivery: "Readiness − exposure vs operating delivery",
  managedReadinessVsDelivery: "Readiness × unexposed share vs operating delivery",
};
const signed = (value: number, suffix = "") => `${value >= 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
const md = `# Indian IT AI transition — FY25 score to FY26 operating delivery

## Design

- **Primary test:** whether reconstructed FY25 readiness predicts FY26 operating delivery.
- **Secondary tests:** exposure, readiness minus exposure, and readiness adjusted for exposure.
- **Delivery index:** equal-weight cross-sectional rank of FY26 revenue growth and margin change. A higher value means better delivery within this ten-company sample; it is not an absolute quality score.
- **Evidence rule:** FY25 scores use only disclosures available by the FY25 cutoff; FY26 outcomes come from official annual results.

| Company | Exposure | Readiness | Gap | FY26 revenue growth | Margin change | Delivery index |
|---|---:|---:|---:|---:|---:|---:|
${rows.map(r => `| ${r.companyName} (${r.symbol}) | ${r.exposureScore.toFixed(1)} | ${r.readinessScore.toFixed(1)} | ${r.transitionGap.toFixed(1)} | ${signed(r.revenueGrowthPct, "%")} | ${signed(r.marginChangePp, " pp")} | ${r.deliveryIndex.toFixed(1)} |`).join("\n")}

## Statistical result

| Relationship | Spearman correlation | Permutation p-value |
|---|---:|---:|
${Object.keys(tests).map(key => `| ${labels[key]} | ${correlations[key].toFixed(2)} | ${pValues[key].toFixed(2)} |`).join("\n")}

Exposure and readiness themselves have a rank correlation of ${exposureReadinessCorrelation.toFixed(2)}. They are therefore not interchangeable measures in this sample.

## Interpretation

The initial hypothesis is **not validated**. FY25 readiness has almost no relationship with FY26 operating delivery in this ten-company sample. Exposure has a modest negative association with delivery, which is directionally sensible, but it is not statistically reliable. Neither subtracting exposure from readiness nor multiplying readiness by the unexposed share produces a dependable result.

The useful conclusion is methodological: exposure and readiness remain diagnostic descriptors, but neither should enter the final BMS as a return or operating-performance factor yet. The most defensible next step is to freeze the FY27 scores prospectively and observe FY27 revenue growth, margin change, AI revenue conversion and deal conversion without changing the weights.

## Important limitations

- Ten observations provide very low statistical power; no causal conclusion is possible.
- Revenue bases differ because companies do not disclose one universal measure. Constant currency is used when available; reported growth is used otherwise.
- Tata Elxsi uses PBT margin and some specialists use EBITDA margin, while services companies generally use EBIT/operating margin. Ranking reduces scale problems but does not make these measures identical.
- Acquisitions, vertical demand, restructuring costs and company-specific events can dominate AI transition effects.
- Reconstructed scores retain some hindsight risk even with dated source cutoffs.

## Official outcome sources

${rows.map(r => `- **${r.symbol}:** [FY25 score anchor](${r.fy25Source}) · [FY26 operating outcome](${r.fy26Source})`).join("\n")}
`;

const output = new URL("../output/ai-transition/", import.meta.url);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(new URL("ten-company-operating-delivery-study.md", output), md);
fs.writeFileSync(new URL("ten-company-operating-delivery-results.json", output), JSON.stringify({ correlations, pValues, exposureReadinessCorrelation, rows }, null, 2));
console.log(JSON.stringify({ correlations, pValues, exposureReadinessCorrelation, companies: rows.length }, null, 2));
