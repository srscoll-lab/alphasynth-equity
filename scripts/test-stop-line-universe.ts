import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { isResearchDossier } from "../src/dossier.ts";
import { assessDossierReadiness } from "../src/dossier-readiness.ts";
import type { DossierPdfPayload } from "../src/dossier-pdf.ts";
import { augmentFactorAnalysisWithDeliveryEvidence } from "../src/bms-factor-schema.ts";

type Company = {
  ticker: string;
  company_name: string;
  lifecycle: string;
  official_domains: string[];
  exchange: "NSE";
  sector: string;
};

type Manifest = {
  cohortId: string;
  purpose: string;
  lifecycleFreezeDate: string;
  companies: Company[];
};

const valueAfter = (prefix: string) => process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
const cutoff = valueAfter("--cutoff=") || new Date().toISOString().slice(0, 10);
const limit = Number(valueAfter("--limit=") || 0);
const selectedTicker = valueAfter("--ticker=")?.toUpperCase();
const baseUrl = (valueAfter("--base-url=") || "https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app").replace(/\/$/, "");
const outputRoot = valueAfter("--output=") || "/tmp";
const listOnly = process.argv.includes("--list");
const skipManagement = process.argv.includes("--skip-management");
const resume = process.argv.includes("--resume");

if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error("--cutoff must be YYYY-MM-DD");
if (!Number.isInteger(limit) || limit < 0) throw new Error("--limit must be a non-negative integer");

const manifest = JSON.parse(fs.readFileSync(path.resolve("scripts/stop-line-universe-companies.json"), "utf8")) as Manifest;
const tracker: any = JSON.parse(fs.readFileSync(path.resolve("src/data/signalTrackerCohort001.json"), "utf8"));
let companies = selectedTicker
  ? manifest.companies.filter(company => company.ticker === selectedTicker)
  : manifest.companies;
if (selectedTicker && !companies.length) throw new Error(`Unknown stop-line ticker: ${selectedTicker}`);
if (limit) companies = companies.slice(0, limit);

if (listOnly) {
  console.log(JSON.stringify({ cutoff, baseUrl, skipManagement, companies }, null, 2));
  process.exit(0);
}

const token = execFileSync("gcloud", [
  "secrets", "versions", "access", "latest",
  "--secret=dossier-internal-token",
  "--project=my-nse-research-app",
], { encoding: "utf8" }).trim();

const outputDirectory = path.join(outputRoot, `alphasynth-stop-line-${cutoff.replaceAll("-", "")}`);
fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });

async function postJson(route: string, body: unknown, authenticated = false, timeout = 300_000) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${route}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authenticated ? { "x-dossier-token": token } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
      const text = await response.text();
      let payload: any;
      try { payload = JSON.parse(text); }
      catch { payload = { error: "Non-JSON response", responsePreview: text.slice(0, 300) }; }
      if (response.ok || response.status < 500 || attempt === 2) return { status: response.status, payload };
      lastError = new Error(`${route} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
    }
  }
  throw lastError;
}

const score100 = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(50 + (numeric / 0.75) * 50))) : 0;
};

const results: any[] = [];
for (const company of companies) {
  const started = Date.now();
  const resultPath = path.join(outputDirectory, `${company.ticker}.json`);
  if (resume && fs.existsSync(resultPath)) {
    const stored = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    const existing = stored.result || stored;
    results.push(existing);
    console.log(JSON.stringify({ ticker: company.ticker, resumed: true, technicalSuccess: existing.technicalSuccess }));
    continue;
  }

  try {
    const trackerCompany = (tracker.companies || []).find((row: any) => row.symbol === company.ticker) || {};
    const dossierResponse = await postJson("/api/dossier/research-evidence", {
      ticker: company.ticker,
      company_name: company.company_name,
      information_cutoff: cutoff,
      official_domains: company.official_domains,
      exchange: company.exchange,
      sector: company.sector,
      social_affects_bms: false,
      official_seed_urls: [trackerCompany?.resultDateSourceUrl].filter(Boolean),
    }, true);
    const dossier = dossierResponse.payload;
    if (dossierResponse.status !== 200 || !isResearchDossier(dossier)) {
      throw new Error(dossier?.error || `Dossier evidence returned HTTP ${dossierResponse.status}`);
    }

    const [financialResponse, extrasResponse, marketResponse, factorResponse] = await Promise.all([
      postJson("/api/pipeline/quarterly-performance", { ticker: company.ticker, information_cutoff: cutoff }),
      postJson("/api/pipeline/report-extras", { ticker: company.ticker, signal: company.lifecycle }),
      postJson("/api/bms/market-context", { ticker: company.ticker }),
      fetch(`${baseUrl}/api/bms/factor-analysis/${encodeURIComponent(company.ticker)}`, {
        signal: AbortSignal.timeout(30_000),
      }).then(async response => ({ status: response.status, payload: await response.json().catch(() => null) })),
    ]);
    const financials = Array.isArray(financialResponse.payload?.rows) ? financialResponse.payload.rows : [];
    const managementResponse = skipManagement
      ? { status: 0, payload: { managementGuidance: { status: "skipped", assessment: null } } }
      : await postJson("/api/bms/management-guidance/from-dossier", { dossier }, true);
    const managementGuidance = managementResponse.payload?.managementGuidance || { status: "unavailable", assessment: null };
    const overlayResponse = await postJson("/api/bms/expectation-delivery/from-dossier", {
      dossier,
      lifecycle: company.lifecycle,
      lifecycleFreezeDate: manifest.lifecycleFreezeDate,
      expectationFreezeDate: cutoff,
      sectorValuationPercentile: null,
      financials,
      managementGuidance,
    }, true);
    const overlay = overlayResponse.payload;
    const factorAnalysis = augmentFactorAnalysisWithDeliveryEvidence(
      factorResponse.payload?.factor_analysis || trackerCompany.factor_analysis || null,
      overlay,
    );
    const payload: DossierPdfPayload = {
      dossier,
      financials,
      enrichment: extrasResponse.status === 200 ? extrasResponse.payload : null,
      market: marketResponse.status === 200 ? marketResponse.payload : null,
      bms: {
        score: score100(trackerCompany.rawBms),
        stage: company.lifecycle,
        period: trackerCompany.period || null,
        factorAnalysis,
        components: [
          ["Earnings", trackerCompany.earnings],
          ["Economics", trackerCompany.economics],
          ["Execution", trackerCompany.execution],
          ["Balance sheet", trackerCompany.balance_sheet],
          ["Management", trackerCompany.management_delivery],
        ].map(([label, score]) => ({ label: String(label), score: score100(score) })),
      },
      deliveryCheck: overlay?.input && overlay?.assessment
        ? { input: overlay.input, assessment: overlay.assessment }
        : null,
    };
    const readiness = assessDossierReadiness(payload);
    const supportedClaims = Object.values(dossier.sections).flat()
      .filter((claim: any) => claim.status === "supported").length;
    const deliveryCoverage = Number(overlay?.assessment?.deliveryCoverage || 0);
    const deliveryComponents = Array.isArray(overlay?.assessment?.deliveryComponents)
      ? overlay.assessment.deliveryComponents.length : 0;
    const result = {
      ticker: company.ticker,
      lifecycle: company.lifecycle,
      technicalSuccess: true,
      seconds: Math.round((Date.now() - started) / 1000),
      officialSources: dossier.sources.length,
      supportedClaims,
      quarterlyRows: financials.length,
      deliveryCoverage,
      deliveryComponents,
      deliveryUsable: deliveryCoverage >= 60 && deliveryComponents >= 2,
      managementStatus: managementGuidance.status,
      managementScore: managementGuidance.assessment?.score ?? null,
      managementUniqueCommitments: managementGuidance.assessment?.commitmentCounts?.uniqueCommitments ?? 0,
      managementMatured: managementGuidance.assessment?.commitmentCounts?.matured ?? 0,
      qualification: overlay?.qualification?.status || "unavailable",
      pdfReady: readiness.ready,
      pdfReadinessReasons: readiness.reasons,
      coverage: readiness.coverage,
      errors: {
        financials: financialResponse.status === 200 ? null : financialResponse.payload?.error || `HTTP ${financialResponse.status}`,
        extras: extrasResponse.status === 200 ? null : extrasResponse.payload?.error || `HTTP ${extrasResponse.status}`,
        market: marketResponse.status === 200 ? null : marketResponse.payload?.error || `HTTP ${marketResponse.status}`,
        factors: factorResponse.status === 200 ? null : factorResponse.payload?.error || `HTTP ${factorResponse.status}`,
        management: skipManagement || managementResponse.status === 200 ? null : managementResponse.payload?.error || `HTTP ${managementResponse.status}`,
        overlay: overlayResponse.status === 200 ? null : overlayResponse.payload?.error || `HTTP ${overlayResponse.status}`,
      },
    };
    fs.writeFileSync(resultPath, JSON.stringify({ result, dossier, financials, managementGuidance, overlay, readiness }, null, 2), { mode: 0o600 });
    results.push(result);
    console.log(JSON.stringify(result));
  } catch (error: any) {
    const result = {
      ticker: company.ticker,
      lifecycle: company.lifecycle,
      technicalSuccess: false,
      seconds: Math.round((Date.now() - started) / 1000),
      error: error?.message || String(error),
    };
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), { mode: 0o600 });
    results.push(result);
    console.log(JSON.stringify(result));
  }
}

const percent = (count: number) => Math.round(count * 1000 / Math.max(results.length, 1)) / 10;
const technicalCount = results.filter(row => row.technicalSuccess).length;
const deliveryCount = results.filter(row => row.deliveryUsable).length;
const pdfCount = results.filter(row => row.pdfReady).length;
const lifecycleBreakdown = Object.fromEntries([...new Set(results.map(row => row.lifecycle))].map(lifecycle => {
  const rows = results.filter(row => row.lifecycle === lifecycle);
  return [lifecycle, {
    tested: rows.length,
    technicalSuccess: rows.filter(row => row.technicalSuccess).length,
    deliveryUsable: rows.filter(row => row.deliveryUsable).length,
    pdfReady: rows.filter(row => row.pdfReady).length,
  }];
}));
const summary = {
  cohortId: manifest.cohortId,
  cutoff,
  baseUrl,
  tested: results.length,
  thresholds: { technicalSuccessPct: 90, deliveryUsablePct: 70, inventedValuesAllowed: 0 },
  outcomes: {
    technicalSuccess: technicalCount,
    technicalSuccessPct: percent(technicalCount),
    deliveryUsable: deliveryCount,
    deliveryUsablePct: percent(deliveryCount),
    pdfReady: pdfCount,
    pdfReadyPct: percent(pdfCount),
  },
  acceptance: {
    technical: percent(technicalCount) >= 90,
    delivery: percent(deliveryCount) >= 70,
    overall: percent(technicalCount) >= 90 && percent(deliveryCount) >= 70,
    note: "PDF readiness is reported separately; blocked PDFs are an intended safety outcome, not a technical failure.",
  },
  lifecycleBreakdown,
  results,
};
fs.writeFileSync(path.join(outputDirectory, "summary.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
console.log(JSON.stringify(summary, null, 2));
if (!summary.acceptance.overall) process.exitCode = 1;
