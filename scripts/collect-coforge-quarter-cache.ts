import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { extractPdfTextLocally } from "../src/pdf-text.ts";

const base = "data/official-quarter-cache/";
const sources: Record<string, string> = {
  "2024-12-31": "https://investors.coforge.com/hubfs/Q3FY25-Web-Presentation.pdf?hsLang=en",
  "2025-03-31": "https://investors.coforge.com/hubfs/Q4_FY25_Presentation.pdf?hsLang=en",
  "2025-06-30": "https://investors.coforge.com/hubfs/Q1-FY26-Web-Presentation-and-Factsheet.pdf?hsLang=en",
  "2025-12-31": "https://investors.coforge.com/hubfs/Q3fy26-Investor-Presentation.pdf?hsLang=en",
  "2026-03-31": "https://investors.coforge.com/hubfs/Investor-Presentation-and-Factsheet-Q4FY26.pdf?hsLang=en",
  "2026-06-30": "https://investors.coforge.com/hubfs/Investor-Presentation-Q1-FY27.pdf?hsLang=en",
};

const manifest = JSON.parse(await readFile(base + "manifest.json", "utf8"));
for (const [period, sourceUrl] of Object.entries(sources)) {
  const cached = manifest.documents.find((document: any) => document.source_url === sourceUrl);
  let bytes: Buffer;
  if (cached) {
    bytes = await readFile(base + cached.sha256 + ".pdf");
  } else {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok || new URL(response.url || sourceUrl).hostname !== "investors.coforge.com") {
      throw new Error(`Official source unavailable for ${period}: ${response.status}`);
    }
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (bytes.length > 25_000_000 || bytes.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error(`Invalid PDF for ${period}`);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (cached && cached.sha256 !== sha256) throw new Error(`Immutable original conflict for ${period}`);
  const text = await extractPdfTextLocally(bytes, 60);
  if (!/Coforge/i.test(text) || !/order intake|fresh order/i.test(text)) {
    throw new Error(`Required issuer evidence is absent for ${period}`);
  }
  await writeFile(base + sha256 + ".pdf", bytes, { flag: "wx" }).catch(async (error: any) => {
    if (error.code !== "EEXIST") throw error;
    const existing = createHash("sha256").update(await readFile(base + sha256 + ".pdf")).digest("hex");
    if (existing !== sha256) throw error;
  });
  if (!cached) {
    manifest.documents.push({
      source_url: sourceUrl,
      sha256,
      media_type: "application/pdf",
      captured_at: new Date().toISOString(),
      acquisition_method: "direct_http",
    });
  }
  await writeFile(base + "manifest.json", JSON.stringify(manifest, null, 2));
  await writeFile(base + sha256 + ".txt", text);
  console.log(JSON.stringify({ period, sha256, characters: text.length }));
}
