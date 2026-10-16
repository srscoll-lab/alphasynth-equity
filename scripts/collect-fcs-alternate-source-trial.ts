import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type CohortCompany = { symbol: string; companyName: string; caseType: string; knownOutcome: string };
type TrialRecord = {
  symbol: string;
  companyName: string;
  status: "provider_data_ready" | "provider_data_incomplete" | "provider_unavailable";
  providerPage: string;
  generatedAt: string | null;
  latestPeriodEnd: string | null;
  providerMetrics: Array<{ metricId: string; value: number; unit: string }>;
  officialResultDocument: { publishedAt: string; url: string } | null;
  reason: string | null;
};

const cohort = JSON.parse(await readFile(resolve("data/fcs-alternate-source-audit-cohort-v1.json"), "utf8"));
const companies = cohort.companies as CohortCompany[];
if (companies.length !== 10) throw new Error("The alternate-source trial must remain capped at exactly ten companies.");

const monthEnds: Record<string, string> = { Mar: "03-31", Jun: "06-30", Sep: "09-30", Dec: "12-31" };
const asNumber = (value: string): number | null => {
  const normalized = value.replace(/₹|,/g, "").replace(/—/g, "").trim();
  const parsed = Number(normalized);
  return normalized && Number.isFinite(parsed) ? parsed : null;
};
const cells = (line: string) => line.split("|").slice(1, -1).map((value) => value.trim());

function limitedSnapshot(markdown: string, company: CohortCompany): TrialRecord {
  const providerPage = `https://tapetide.com/stocks/${encodeURIComponent(company.symbol)}`;
  const generatedAt = markdown.match(/^generated_at:\s*"([^"]+)"/m)?.[1] || null;
  const quarterly = markdown.match(/### Quarterly Results\s+All figures[\s\S]*?(?=\n### |\n## )/)?.[0] || "";
  const lines = quarterly.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
  const header = lines.find((line) => /^\|\s*Item\s*\|/i.test(line));
  if (!header) return { symbol: company.symbol, companyName: company.companyName, status: "provider_data_incomplete", providerPage, generatedAt, latestPeriodEnd: null, providerMetrics: [], officialResultDocument: null, reason: "quarterly_table_missing" };
  const periods = cells(header).slice(1);
  const latestLabel = periods.at(-1) || "";
  const periodMatch = latestLabel.match(/^(Mar|Jun|Sep|Dec)\s+(20\d{2})$/);
  const latestPeriodEnd = periodMatch ? `${periodMatch[2]}-${monthEnds[periodMatch[1]]}` : null;
  const wanted: Record<string, string> = { Sales: "revenue", "Operating Profit": "operating_profit", "OPM %": "operating_margin", "Net Profit": "net_profit" };
  const providerMetrics: TrialRecord["providerMetrics"] = [];
  for (const [label, metricId] of Object.entries(wanted)) {
    const row = lines.find((line) => cells(line)[0]?.toLowerCase() === label.toLowerCase());
    const value = row ? asNumber(cells(row).at(-1) || "") : null;
    if (value !== null) providerMetrics.push({ metricId, value, unit: label === "OPM %" ? "%" : "INR crore" });
  }
  const results = markdown.match(/### Results & Financial Statements[\s\S]*?(?=\n### |\n## |\n---)/)?.[0] || "";
  const documentMatch = results.match(/\|\s*(20\d{2}-\d{2}-\d{2})\s*\|\s*\[[^\]]+\]\((https:\/\/[^)]+\.pdf)\)\s*\|/i);
  const officialResultDocument = documentMatch ? { publishedAt: documentMatch[1], url: documentMatch[2] } : null;
  const periodTime = latestPeriodEnd ? Date.parse(`${latestPeriodEnd}T00:00:00Z`) : NaN;
  const publicationTime = officialResultDocument ? Date.parse(`${officialResultDocument.publishedAt}T00:00:00Z`) : NaN;
  const alignedDocument = Number.isFinite(periodTime) && Number.isFinite(publicationTime)
    && publicationTime >= periodTime && publicationTime <= periodTime + 90 * 86_400_000;
  const ready = Boolean(latestPeriodEnd && providerMetrics.length >= 3 && officialResultDocument && alignedDocument);
  return { symbol: company.symbol, companyName: company.companyName, status: ready ? "provider_data_ready" : "provider_data_incomplete", providerPage, generatedAt, latestPeriodEnd, providerMetrics, officialResultDocument, reason: ready ? null : "latest_period_or_official_result_link_incomplete" };
}

const records: TrialRecord[] = [];
for (const company of companies) {
  const url = `https://tapetide.com/stocks/${encodeURIComponent(company.symbol)}.md`;
  try {
    const response = await fetch(url, { headers: { Accept: "text/markdown", "User-Agent": "AlphaSynth-FCS-source-audit/1.0" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    records.push(limitedSnapshot(await response.text(), company));
  } catch (error) {
    records.push({ symbol: company.symbol, companyName: company.companyName, status: "provider_unavailable", providerPage: url.replace(/\.md$/, ""), generatedAt: null, latestPeriodEnd: null, providerMetrics: [], officialResultDocument: null, reason: error instanceof Error ? error.message : String(error) });
  }
}

const report = {
  schemaVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  provider: "tapetide_public_markdown",
  purpose: cohort.purpose,
  safeguards: {
    updatesFcsScores: false,
    updatesLifecycle: false,
    updatesPreflightApprovals: false,
    fullProviderPagesPersisted: false,
    nextStep: "Verify the limited provider metrics against the linked dated BSE/issuer originals before assessing accuracy.",
  },
  summary: {
    companies: records.length,
    providerDataReady: records.filter((record) => record.status === "provider_data_ready").length,
    incomplete: records.filter((record) => record.status === "provider_data_incomplete").length,
    unavailable: records.filter((record) => record.status === "provider_unavailable").length,
  },
  records,
};

await mkdir(resolve("output"), { recursive: true });
await writeFile(resolve("output/fcs-alternate-source-trial-latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary));
