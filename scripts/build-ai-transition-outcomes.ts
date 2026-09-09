import fs from "node:fs";
import { calculateMarketOutcome, type PricePoint } from "../src/ai-transition-outcomes";

const observedThrough = new Date().toISOString().slice(0, 10);
const benchmark = "^CNXIT";
const inputs = [
  { file: "ai-transition-intellect-history.json", yahoo: "INTELLECT.NS" },
  { file: "ai-transition-tcs-history.json", yahoo: "TCS.NS" },
  { file: "ai-transition-tataelxsi-history.json", yahoo: "TATAELXSI.NS" },
];

async function prices(symbol: string, start: string): Promise<PricePoint[]> {
  const period1 = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplits`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 AlphaSynth research calibration" } });
  if (!response.ok) throw new Error(`${symbol}: HTTP ${response.status}`);
  const result: any = (await response.json()).chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const adjusted: Array<number | null> = result?.indicators?.adjclose?.[0]?.adjclose || result?.indicators?.quote?.[0]?.close || [];
  return timestamps.flatMap((timestamp, index) => Number.isFinite(adjusted[index]) ? [{
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    adjustedClose: Number(adjusted[index]),
  }] : []);
}

const histories = inputs.map((input) => ({
  ...input,
  history: JSON.parse(fs.readFileSync(new URL(`./${input.file}`, import.meta.url), "utf8")),
}));
const earliest = histories.flatMap((item) => item.history.map((record: any) => record.assessmentAsOf)).sort()[0];
const benchmarkPoints = await prices(benchmark, earliest);
const outcomes = [];
for (const input of histories) {
  const companyPoints = await prices(input.yahoo, earliest);
  for (const assessment of input.history) {
    for (const horizonMonths of [3, 6, 12] as const) {
      outcomes.push(calculateMarketOutcome({ symbol: assessment.symbol, benchmark, assessmentAsOf: assessment.assessmentAsOf, horizonMonths, observedThrough, companyPoints, benchmarkPoints }));
    }
  }
}
const result = {
  generatedAt: new Date().toISOString(),
  observedThrough,
  priceSource: "Yahoo Finance chart API adjusted close",
  benchmark,
  caveat: "Exploratory reconstructed outcome study. Relative return is not evidence that AI caused the result.",
  outcomes,
};
const directory = new URL("../output/ai-transition/", import.meta.url);
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(new URL("market-outcomes.json", directory), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ observations: outcomes.length, complete: outcomes.filter((item) => item.status === "complete").length, pending: outcomes.filter((item) => item.status === "pending").length }, null, 2));
