import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { extractPdfTextLocally } from "../src/pdf-text.ts";

const base = "data/official-quarter-cache/";
const sources: Record<string, string> = {
  "2024-12-31": "https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2024-25/q3/Presentations/Q3%202024-25%20Fact%20Sheet.pdf",
  "2025-03-31": "https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2024-25/q4/Presentations/Q4%202024-25%20Fact%20Sheet.pdf",
  "2025-06-30": "https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2025-26/q1/Presentations/Q1%202025-26%20Fact%20Sheet.pdf",
  "2025-12-31": "https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2025-26/q3/Presentations/Q3%202025-26%20Fact%20Sheet.pdf",
  "2026-03-31": "https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2025-26/q4/Presentations/Q4%202025-26%20Fact%20Sheet.pdf",
  "2026-06-30": "https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2026-27/q1/Presentations/Q1%202026-27%20Fact%20Sheet.pdf",
};
const manifest = JSON.parse(await readFile(base + "manifest.json", "utf8"));
for (const [period, sourceUrl] of Object.entries(sources)) {
  const cached = manifest.documents.find((document: any) => document.source_url === sourceUrl);
  const response = cached ? null : await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
  if (response && (!response.ok || new URL(response.url || sourceUrl).hostname !== "www.tcs.com")) {
    throw new Error(`Official source unavailable for ${period}: ${response.status}`);
  }
  const bytes = cached ? await readFile(base + cached.sha256 + ".pdf") : Buffer.from(await response!.arrayBuffer());
  if (bytes.length > 25_000_000 || bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`Invalid PDF for ${period}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const text = await extractPdfTextLocally(bytes, 40);
  if (!/TATA CONSULTANCY SERVICES|TCS/i.test(text) || !/Operating Margin/i.test(text)) throw new Error(`Required issuer evidence absent for ${period}`);
  await writeFile(base + sha256 + ".pdf", bytes, { flag: "wx" }).catch((error: any) => { if (error.code !== "EEXIST") throw error; });
  if (!cached) manifest.documents.push({ source_url: sourceUrl, sha256, media_type: "application/pdf", captured_at: new Date().toISOString(), acquisition_method: "direct_http" });
  await writeFile(base + "manifest.json", JSON.stringify(manifest, null, 2));
  await writeFile(base + sha256 + ".txt", text);
  console.log(JSON.stringify({ period, sha256, characters: text.length }));
}
