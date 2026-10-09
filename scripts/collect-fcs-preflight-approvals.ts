import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import Firecrawl from "@mendable/firecrawl-js";
import { buildFcsEvidencePreflightSnapshot, type FcsPreflightEvidenceApproval } from "../src/fcs-evidence-preflight.ts";
import { qualifyPreflightDocuments } from "../src/fcs-preflight-collector.ts";
import { cachedIssuerIdentity } from "../src/fcs-cached-issuer-identity.ts";
import { discoverFcsIssuerDomains } from "../src/fcs-issuer-source-discovery.ts";
import { discoverFirecrawlFcsSources } from "../src/fcs-firecrawl-discovery.ts";
import { discoverIssuerIndexLinks } from "../src/fcs-issuer-index-discovery.ts";
import { retrieveGroundedFcsDocuments, type GroundedDocumentCandidate } from "../src/fcs-grounded-document-retrieval.ts";
import { createFirecrawlDocumentFetch } from "../src/fcs-firecrawl-document-fetch.ts";
import { officialDocumentFetch } from "../src/official-document-cache.ts";

const argumentsSet = new Set(process.argv.slice(2));
const execute = argumentsSet.has("--execute");
const limitText = process.argv.find((argument) => argument.startsWith("--limit="))?.split("=")[1];
const limit = Number(limitText || (execute ? NaN : 10));
if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error("--limit is required for execution and must be an integer from 1 to 25.");
const symbolsText = process.argv.find((argument) => argument.startsWith("--symbols="))?.slice("--symbols=".length);
const requestedSymbols = new Set((symbolsText || "").split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean));
const offsetText = process.argv.find((argument) => argument.startsWith("--offset="))?.split("=")[1];
const offset = Number(offsetText || 0);
if (!Number.isInteger(offset) || offset < 0 || offset > 99) throw new Error("--offset must be an integer from 0 to 99.");
const cutoff = process.argv.find((argument) => argument.startsWith("--cutoff="))?.slice("--cutoff=".length) || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff) || cutoff > new Date().toISOString().slice(0, 10)) throw new Error("--cutoff must be a valid date no later than today.");

const approvalPath = resolve("src/data/fcsPreflightEvidenceApprovals.json");
const snapshotPath = resolve("src/data/fcsEvidencePreflight.json");
const priority = buildFcsEvidencePreflightSnapshot().priorityBatch.records
  .filter((record) => record.status === "partial" && (!requestedSymbols.size || requestedSymbols.has(record.symbol)))
  .slice(offset, offset + limit);

const projection = {
  companies: priority.length,
  maximumFirecrawlSearchCalls: priority.length * 3,
  maximumFirecrawlPdfScrapes: priority.length * 4,
  maximumPaidProviderCalls: priority.length * 7,
  maximumDirectHttpsRequests: priority.length * 40,
  modelCalls: 0,
};

if (!execute) {
  console.log(JSON.stringify({ mode: "dry_run", executeCommand: `npm run collect:fcs-preflight -- --execute --limit=${limit} --offset=${offset}${requestedSymbols.size ? ` --symbols=${[...requestedSymbols].join(",")}` : ""} --cutoff=${cutoff}`, projection,
    companies: priority.map(({ symbol, companyName, capSegment }) => ({ symbol, companyName, capSegment })) }, null, 2));
  process.exit(0);
}
if (!process.env.FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is required for --execute.");
if (!priority.length) throw new Error("No partial priority-batch companies matched the requested selection.");

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

function searchReferences(result: any): GroundedDocumentCandidate[] {
  const rows = Array.isArray(result?.web) ? result.web : Array.isArray(result?.data?.web) ? result.data.web : [];
  const candidates = new Map<string, GroundedDocumentCandidate>();
  for (const row of rows.slice(0, 8)) {
    for (const match of `${row.url || ""}\n${String(row.description || "").slice(0, 50_000)}`.matchAll(/https:\/\/[^\s<>"']+/gi)) {
      try {
        const url = new URL(match[0].replace(/[),.;\]*]+$/g, ""));
        if (!url.username && !url.password && !url.port) candidates.set(url.href, { uri: url.href, title: String(row.title || "Official document candidate").slice(0, 200) });
      } catch { /* Invalid search links are ignored. */ }
    }
  }
  return [...candidates.values()].slice(0, 16);
}

async function atomicPersistApproval(approval: FcsPreflightEvidenceApproval): Promise<void> {
  const raw = await readFile(approvalPath, "utf8");
  const payload = JSON.parse(raw);
  if (!Array.isArray(payload.records)) throw new Error("The preflight approval ledger is invalid.");
  const records = payload.records.filter((record: any) => record?.symbol !== approval.symbol);
  records.push(approval);
  records.sort((left: any, right: any) => String(left.symbol).localeCompare(String(right.symbol)));
  const next = `${JSON.stringify({ ...payload, records }, null, 2)}\n`;
  const temporary = `${approvalPath}.${process.pid}.tmp`;
  const backup = `${approvalPath}.bak`;
  await mkdir(dirname(approvalPath), { recursive: true });
  await copyFile(approvalPath, backup);
  await writeFile(temporary, next, { encoding: "utf8", flag: "wx" });
  JSON.parse(await readFile(temporary, "utf8"));
  await rename(temporary, approvalPath);
}

const results: Array<Record<string, unknown>> = [];
for (const company of priority) {
  let directCalls = 0;
  let searchCalls = 0;
  const countedFetch: typeof fetch = async (input, init) => {
    if (++directCalls > 40) throw new Error("per_company_direct_request_limit");
    return officialDocumentFetch(input, init);
  };
  const search = async (query: string, options: any) => {
    if (++searchCalls > 3) throw new Error("per_company_search_limit");
    return firecrawl.search(query, { ...options, limit: Math.min(8, Number(options?.limit) || 8) });
  };
  try {
    let identity = await cachedIssuerIdentity(company.symbol, company.companyName, { fetchImpl: countedFetch });
    if (!identity.domains.length) {
      const discovered = await discoverFcsIssuerDomains({
        ticker: company.symbol,
        companyName: company.companyName,
        fetchImpl: countedFetch,
        search: async (query) => searchReferences(await search(query, { limit: 8, sources: ["web"], timeout: 30_000 })),
      });
      identity = { domains: discovered.domains, proofs: [] };
    }
    if (identity.domains.length !== 1) {
      results.push({ symbol: company.symbol, promoted: false, reason: "issuer_identity_not_verified", directCalls, searchCalls });
      continue;
    }
    const discovery = await discoverFirecrawlFcsSources({
      ticker: company.symbol,
      companyName: company.companyName,
      cutoff,
      trustedIssuerDomains: identity.domains,
      search,
    });
    const index = await discoverIssuerIndexLinks(identity.domains, countedFetch);
    const candidates = [...discovery.candidates, ...index.candidates].filter((candidate, position, all) => all.findIndex((item) => item.uri === candidate.uri) === position).slice(0, 24);
    if (!candidates.length) {
      results.push({ symbol: company.symbol, promoted: false, reason: "official_financial_documents_not_discovered", directCalls, searchCalls });
      continue;
    }
    const firecrawlFetch = createFirecrawlDocumentFetch({
      directFetch: countedFetch,
      trustedIssuerDomains: identity.domains,
      maxCalls: 4,
      scrape: (url, options) => firecrawl.scrape(url, options),
    });
    const retrieved = await retrieveGroundedFcsDocuments(candidates, {
      trustedIssuerDomains: identity.domains,
      maxDocuments: 6,
      maxRequests: 20,
      maximumPages: 30,
      timeoutMs: 60_000,
      fetchImpl: firecrawlFetch.fetchImpl,
    });
    const qualified = qualifyPreflightDocuments({
      symbol: company.symbol,
      checkedAt: new Date().toISOString(),
      cutoff,
      trustedIssuerDomains: identity.domains,
      documents: retrieved.documents,
    });
    if (!qualified.approval) {
      results.push({ symbol: company.symbol, promoted: false, reason: qualified.reasons, documents: retrieved.documents.length, directCalls, searchCalls, firecrawlDiagnostics: firecrawlFetch.diagnostics });
      continue;
    }
    await atomicPersistApproval(qualified.approval);
    results.push({ symbol: company.symbol, promoted: true, documents: retrieved.documents.length, directCalls, searchCalls, firecrawlDiagnostics: firecrawlFetch.diagnostics });
  } catch (error) {
    results.push({ symbol: company.symbol, promoted: false, reason: error instanceof Error ? error.message : String(error), directCalls, searchCalls });
  }
}

// Run in a fresh module process so the newly persisted JSON ledger is loaded,
// then replace the generated snapshot using its own deterministic builder.
execFileSync(process.execPath, ["--import", "tsx", resolve("scripts/build-fcs-evidence-preflight.ts"), snapshotPath], { stdio: "inherit" });
const runReport = { mode: "execute", cutoff, offset, projection, results };
await mkdir(resolve("output"), { recursive: true });
await writeFile(resolve("output/fcs-preflight-run-latest.json"), `${JSON.stringify(runReport, null, 2)}\n`, "utf8");
console.log(JSON.stringify(runReport, null, 2));
