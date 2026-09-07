// Explicit, bounded live diagnostic. Run in Cloud Shell; secrets never leave the process.
import { execFileSync } from "node:child_process";
import Firecrawl from "@mendable/firecrawl-js";
import { collectOfficialEvidence } from "../src/dossier-evidence";

const apiKey = execFileSync("gcloud", ["secrets", "versions", "access", "latest", "--secret=firecrawl-api-key", "--project=my-nse-research-app"], { encoding: "utf8" }).trim();
const scraper = new Firecrawl({ apiKey });
const result = await collectOfficialEvidence([{ url: "https://radicokhaitan.com/investor-relations/" }], ["radicokhaitan.com"], "2026-09-05", (url, options) => scraper.scrape(url, options));
console.log(JSON.stringify({ sources: result.sources, diagnostics: result.diagnostics, evidenceCharacters: result.evidence.map(e => e.text.length) }, null, 2));
if (!result.sources.length) process.exitCode = 1;
