import fs from "node:fs/promises";
import path from "node:path";
import { discoverOfficialDisclosures, isWithinStudyWindow } from "../src/ai-transition-sources";

type CalibrationCompany = {
  ticker: string;
  companyName: string;
  businessModel: string;
  officialDomains: string[];
  archiveUrls: string[];
};

const manifest = JSON.parse(await fs.readFile(new URL("./ai-transition-calibration.json", import.meta.url), "utf8")) as CalibrationCompany[];
const requested = process.argv.find((argument) => argument.startsWith("--ticker="))?.split("=")[1]?.toUpperCase();
const output = path.resolve(process.argv.find((argument) => argument.startsWith("--output="))?.split("=")[1] || "output/ai-transition/source-inventory.json");

const companies = [];
for (const company of manifest.filter((item) => !requested || item.ticker === requested)) {
  const disclosures = new Map<string, ReturnType<typeof discoverOfficialDisclosures>[number]>();
  const archiveDiagnostics = [];
  for (const archiveUrl of company.archiveUrls) {
    try {
      const response = await fetch(archiveUrl, {
        headers: { "User-Agent": "AlphaSynth-Research/0.1 (+official disclosure inventory)" },
        signal: AbortSignal.timeout(30_000),
      });
      const html = await response.text();
      const links = response.ok ? discoverOfficialDisclosures(html, archiveUrl, company.officialDomains) : [];
      const inWindow = links.filter((link) => isWithinStudyWindow(`${link.label} ${link.url}`, 2023));
      inWindow.forEach((link) => disclosures.set(link.url, link));
      archiveDiagnostics.push({ archiveUrl, httpStatus: response.status, discovered: links.length, admittedToWindow: inWindow.length });
    } catch (error: any) {
      archiveDiagnostics.push({ archiveUrl, error: error?.message || String(error), discovered: 0 });
    }
  }
  const quarterlyEvidenceCount = [...disclosures.values()].filter((item) =>
    ["earnings_transcript", "investor_presentation", "results"].includes(item.sourceType)).length;
  companies.push({
    ...company,
    status: quarterlyEvidenceCount >= 8 ? "inventory_ready" : "requires_rendered_discovery",
    quarterlyEvidenceCount,
    archiveDiagnostics,
    disclosures: [...disclosures.values()],
  });
}

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({ generatedAt: new Date().toISOString(), companies }, null, 2));
console.log(JSON.stringify(companies.map((company) => ({ ticker: company.ticker, status: company.status, disclosures: company.disclosures.length }))));
console.log(output);
