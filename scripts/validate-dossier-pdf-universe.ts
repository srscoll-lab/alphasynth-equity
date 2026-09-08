import fs from "node:fs/promises";
import path from "node:path";
import { renderDossierPdf, type DossierPdfPayload } from "../src/dossier-pdf";

type PilotCompany = {
  ticker: string;
  company_name: string;
};

const baseUrl = (process.argv.find((arg) => arg.startsWith("--base-url="))
  ?.slice("--base-url=".length) || "https://dossier-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app").replace(/\/$/, "");
const cutoff = process.argv.find((arg) => arg.startsWith("--cutoff="))?.slice("--cutoff=".length)
  || new Date().toISOString().slice(0, 10);
const requestedTicker = process.argv.find((arg) => arg.startsWith("--ticker="))?.slice("--ticker=".length).toUpperCase();
const outputDirectory = path.resolve("output/pdf/template-validation");
const manifest = JSON.parse(await fs.readFile(path.resolve("scripts/dossier-pilot-companies.json"), "utf8")) as PilotCompany[];

const fetchJson = async (endpoint: string, body?: unknown, timeout = 300_000) => {
  const response = await fetch(`${baseUrl}${endpoint}`, body === undefined ? {
    signal: AbortSignal.timeout(timeout),
  } : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const text = await response.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { payload = { error: text.slice(0, 300) }; }
  if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}: ${payload?.error || "unknown error"}`);
  return payload;
};

const score100 = (value: unknown) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((Math.abs(number) <= 1 ? number * 100 : number) * 10) / 10;
};

await fs.mkdir(outputDirectory, { recursive: true });
const lifecycle = await fetchJson("/api/bms/lifecycle", undefined, 60_000);
const bmsCompanies = Array.isArray(lifecycle?.companies) ? lifecycle.companies : [];
const results: Array<Record<string, unknown>> = [];

for (const company of manifest.slice(0, 5).filter((item) => !requestedTicker || item.ticker === requestedTicker)) {
  const started = Date.now();
  try {
    const bmsCompany = bmsCompanies.find((item: any) => String(item.symbol).toUpperCase() === company.ticker);
    const sharedBody = { ticker: company.ticker };
    const [dossier, peerPayload, financialPayload, enrichment, market] = await Promise.all([
      fetchJson("/api/dossier/generate", {
        ticker: company.ticker,
        company_name: company.company_name,
        reporting_period: bmsCompany?.period,
        information_cutoff: cutoff,
      }),
      fetchJson("/api/pipeline/peer-comparison", sharedBody).catch(() => ({ rows: [] })),
      fetchJson("/api/pipeline/quarterly-performance", sharedBody).catch(() => ({ rows: [] })),
      fetchJson("/api/pipeline/report-extras", {
        ticker: company.ticker,
        signal: bmsCompany?.momentum_state || bmsCompany?.lifecycle_stage,
      }).catch(() => null),
      fetchJson("/api/bms/market-context", sharedBody).catch(() => null),
    ]);
    const pdfPayload: DossierPdfPayload = {
      dossier,
      peers: Array.isArray(peerPayload?.rows) ? peerPayload.rows : [],
      financials: Array.isArray(financialPayload?.rows) ? financialPayload.rows : [],
      enrichment,
      market,
      bms: {
        score: bmsCompany?.bms ?? null,
        stage: bmsCompany?.lifecycle_stage ?? null,
        period: bmsCompany?.period ?? null,
        factorAnalysis: bmsCompany?.factor_analysis ?? null,
        components: bmsCompany ? [
          { label: "Earnings", score: score100(bmsCompany.earnings) },
          { label: "Economics", score: score100(bmsCompany.economics) },
          { label: "Execution", score: score100(bmsCompany.execution) },
          { label: "Balance sheet", score: score100(bmsCompany.balance_sheet) },
          { label: "Management", score: score100(bmsCompany.management_delivery) },
        ] : [],
      },
    };
    const quarterCount = pdfPayload.financials?.length || dossier.quarterlyPerformance?.length || 0;
    const pricePointCount = market?.priceHistory?.length || 0;
    const peerChartCount = (pdfPayload.peers || []).filter((peer) =>
      peer.revenueGrowthYoY != null && peer.operatingMargin != null).length;
    if (quarterCount < 2 || pricePointCount < 2 || peerChartCount < 2) {
      throw new Error(`Incomplete chart data: ${quarterCount} quarterly rows, ${pricePointCount} price points and ${peerChartCount} plottable peers. PDF not generated.`);
    }
    const pdf = await renderDossierPdf(pdfPayload);
    const pdfPath = path.join(outputDirectory, `${company.ticker}-Research-Dossier.pdf`);
    const jsonPath = path.join(outputDirectory, `${company.ticker}-payload.json`);
    await Promise.all([
      fs.writeFile(pdfPath, pdf),
      fs.writeFile(jsonPath, JSON.stringify(pdfPayload, null, 2)),
    ]);
    results.push({ ticker: company.ticker, pass: true, seconds: Math.round((Date.now() - started) / 1000), pdfPath, jsonPath });
  } catch (error: any) {
    results.push({ ticker: company.ticker, pass: false, seconds: Math.round((Date.now() - started) / 1000), error: error?.message || String(error) });
  }
  console.log(JSON.stringify(results.at(-1)));
}

const summary = { baseUrl, cutoff, generatedAt: new Date().toISOString(), results };
await fs.writeFile(path.join(outputDirectory, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (results.some((result) => !result.pass)) process.exitCode = 1;
