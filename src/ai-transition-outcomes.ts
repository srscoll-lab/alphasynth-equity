export type PricePoint = { date: string; adjustedClose: number };

export type AiTransitionMarketOutcome = {
  symbol: string;
  benchmark: string;
  assessmentAsOf: string;
  horizonMonths: 3 | 6 | 12;
  targetDate: string;
  status: "complete" | "pending" | "no_data";
  startDate: string | null;
  endDate: string | null;
  companyReturnPct: number | null;
  benchmarkReturnPct: number | null;
  relativeReturnPct: number | null;
  interpretation: "outperformed" | "matched" | "underperformed" | "pending";
};

export function addUtcMonths(date: string, months: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}

function commonOnOrAfter(companyPoints: PricePoint[], benchmarkPoints: PricePoint[], date: string) {
  const benchmarkByDate = new Map(benchmarkPoints.map((point) => [point.date, point]));
  for (const company of companyPoints) {
    if (company.date < date) continue;
    const benchmark = benchmarkByDate.get(company.date);
    if (benchmark) return { company, benchmark };
  }
  return null;
}

const pct = (start: number, end: number) => Math.round(((end / start) - 1) * 1000) / 10;

export function calculateMarketOutcome(input: {
  symbol: string;
  benchmark: string;
  assessmentAsOf: string;
  horizonMonths: 3 | 6 | 12;
  observedThrough: string;
  companyPoints: PricePoint[];
  benchmarkPoints: PricePoint[];
}): AiTransitionMarketOutcome {
  const targetDate = addUtcMonths(input.assessmentAsOf, input.horizonMonths);
  const base = {
    symbol: input.symbol,
    benchmark: input.benchmark,
    assessmentAsOf: input.assessmentAsOf,
    horizonMonths: input.horizonMonths,
    targetDate,
  };
  if (targetDate > input.observedThrough) {
    return { ...base, status: "pending", startDate: null, endDate: null, companyReturnPct: null, benchmarkReturnPct: null, relativeReturnPct: null, interpretation: "pending" };
  }
  const start = commonOnOrAfter(input.companyPoints, input.benchmarkPoints, input.assessmentAsOf);
  const end = commonOnOrAfter(input.companyPoints, input.benchmarkPoints, targetDate);
  if (!start || !end) {
    return { ...base, status: "no_data", startDate: start?.company.date || null, endDate: end?.company.date || null, companyReturnPct: null, benchmarkReturnPct: null, relativeReturnPct: null, interpretation: "pending" };
  }
  const companyReturnPct = pct(start.company.adjustedClose, end.company.adjustedClose);
  const benchmarkReturnPct = pct(start.benchmark.adjustedClose, end.benchmark.adjustedClose);
  const relativeReturnPct = Math.round((companyReturnPct - benchmarkReturnPct) * 10) / 10;
  return {
    ...base,
    status: "complete",
    startDate: start.company.date,
    endDate: end.company.date,
    companyReturnPct,
    benchmarkReturnPct,
    relativeReturnPct,
    interpretation: relativeReturnPct > 2 ? "outperformed" : relativeReturnPct < -2 ? "underperformed" : "matched",
  };
}
