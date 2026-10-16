import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const trial = JSON.parse(await readFile(resolve("output/fcs-alternate-source-trial-latest.json"), "utf8"));
const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
const number = (text: string) => {
  const normalized = strip(text).replace(/,/g, "").replace(/%/g, "").replace(/—/g, "").trim();
  const value = Number(normalized);
  return normalized && Number.isFinite(value) ? value : null;
};

function secondaryQuarter(html: string, targetPeriod: string | null) {
  const sectionStart = html.indexOf('id="quarters"');
  if (sectionStart < 0) return { values: {}, reason: "quarterly_section_missing" };
  const sectionEnd = html.indexOf("</section>", sectionStart);
  const section = html.slice(sectionStart, sectionEnd > sectionStart ? sectionEnd : sectionStart + 150_000);
  const dates = [...section.matchAll(/data-date-key="(20\d{2}-\d{2}-\d{2})"/g)].map((match) => match[1]);
  const targetIndex = targetPeriod ? dates.indexOf(targetPeriod) : -1;
  if (targetIndex < 0) return { values: {}, reason: "target_period_missing" };
  const aliases: Record<string, RegExp> = {
    revenue: /^(?:Sales|Revenue|Financing Profit)$/i,
    operating_profit: /^Operating Profit$/i,
    operating_margin: /^OPM %$/i,
    net_profit: /^Net Profit$/i,
  };
  const values: Record<string, number> = {};
  for (const rowMatch of section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < targetIndex + 2) continue;
    const label = strip(cells[0]).replace(/\s*\+$/, "");
    const metricId = Object.entries(aliases).find(([, pattern]) => pattern.test(label))?.[0];
    const value = number(cells[targetIndex + 1]);
    if (metricId && value !== null) values[metricId] = value;
  }
  return { values, reason: null };
}

const records = [];
for (const record of trial.records) {
  const url = `https://www.screener.in/company/${encodeURIComponent(record.symbol)}/consolidated/`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "AlphaSynth-FCS-source-audit/1.0" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const secondary = secondaryQuarter(await response.text(), record.latestPeriodEnd);
    const comparisons = record.providerMetrics.map((metric: any) => {
      const secondaryValue = secondary.values[metric.metricId];
      return { metricId: metric.metricId, providerValue: metric.value, secondaryValue: secondaryValue ?? null, match: secondaryValue !== undefined && Number(metric.value) === Number(secondaryValue) };
    });
    records.push({
      symbol: record.symbol,
      status: comparisons.length && comparisons.every((item: any) => item.match) ? "all_available_values_match" : comparisons.some((item: any) => item.match) ? "partial_match" : "no_match",
      providerPeriodEnd: record.latestPeriodEnd,
      secondaryUrl: url,
      matched: comparisons.filter((item: any) => item.match).length,
      compared: comparisons.length,
      reason: secondary.reason,
      comparisons,
    });
  } catch (error) {
    records.push({ symbol: record.symbol, status: "secondary_unavailable", providerPeriodEnd: record.latestPeriodEnd, secondaryUrl: url, matched: 0, compared: 0, reason: error instanceof Error ? error.message : String(error), comparisons: [] });
  }
}

const comparableMetrics = records.reduce((sum, record) => sum + record.compared, 0);
const matchedMetrics = records.reduce((sum, record) => sum + record.matched, 0);
const report = {
  schemaVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  methodology: "The same latest quarterly period and four limited rounded fields are compared with a public Screener consolidated-results table. This is a secondary sanity check, not an official-source substitute and not a licensed production feed.",
  summary: {
    companies: records.length,
    allAvailableValuesMatch: records.filter((record) => record.status === "all_available_values_match").length,
    partialMatch: records.filter((record) => record.status === "partial_match").length,
    noMatch: records.filter((record) => record.status === "no_match").length,
    unavailable: records.filter((record) => record.status === "secondary_unavailable").length,
    comparableMetrics,
    matchedMetrics,
    agreementPct: comparableMetrics ? Number((matchedMetrics / comparableMetrics * 100).toFixed(1)) : null,
    updatesFcsScores: false,
  },
  records,
};
await writeFile(resolve("output/fcs-alternate-source-secondary-audit-latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary));
