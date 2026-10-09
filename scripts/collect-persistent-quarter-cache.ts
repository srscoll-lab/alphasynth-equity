import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { extractPdfTextLocally } from "../src/pdf-text.ts";

const base = "data/official-quarter-cache/";
const sources: Record<string, string> = {
  "2024-12-31": "https://www.persistent.com/wp-content/uploads/2025/01/analyst-presentation-and-factsheet-q3fy25.pdf",
  "2025-03-31": "https://www.persistent.com/wp-content/uploads/2025/04/analyst-presentation-and-factsheet-q4fy25.pdf",
  "2025-06-30": "https://www.persistent.com/wp-content/uploads/2025/07/analyst-presentation-and-factsheet-q1fy26.pdf",
  "2025-12-31": "https://www.persistent.com/wp-content/uploads/2026/01/analyst-presentation-and-factsheet-q3fy26.pdf",
  "2026-03-31": "https://www.persistent.com/wp-content/uploads/2026/04/analyst-presentation-and-factsheet-q4fy26.pdf",
  "2026-06-30": "https://www.persistent.com/wp-content/uploads/2026/08/analyst-presentation-and-factsheet-q1fy27.pdf",
};

const manifest = JSON.parse(await readFile(base + "manifest.json", "utf8"));
for (const [period, sourceUrl] of Object.entries(sources)) {
  const cached = manifest.documents.find((document: any) => document.source_url === sourceUrl);
  let bytes: Buffer;
  if (cached) {
    bytes = await readFile(base + cached.sha256 + ".pdf");
  } else {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok || new URL(response.url || sourceUrl).hostname !== "www.persistent.com") {
      throw new Error(`Official source unavailable for ${period}: ${response.status}`);
    }
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (bytes.length > 25_000_000 || bytes.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error(`Invalid PDF for ${period}`);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (cached && cached.sha256 !== sha256) throw new Error(`Immutable original conflict for ${period}`);
  const text = await extractPdfTextLocally(bytes, 50);
  if (!text.includes("Persistent Systems") || !/Cash and Investments/i.test(text)) {
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
