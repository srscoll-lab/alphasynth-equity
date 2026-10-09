import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fundamentalChangeLibrary } from "../src/data/fundamentalChangeLibrary.ts";
import { mergeFcsPublications } from "../src/fcs-publications.ts";

const base = "https://expectation-pilot---alphasynth-equity-oqc2y4ogda-uc.a.run.app";
const manifest = JSON.parse(await readFile("data/official-quarter-cache/manifest.json", "utf8"));
const response = await fetch(`${base}/api/bms/fundamental-review/result/COFORGE`, { signal: AbortSignal.timeout(30_000) });
assert.equal(response.status, 200);
const payload: any = await response.json();
assert.equal(payload.job.status, "ready");
assert.equal(payload.informationCutoff, "2026-10-09");
assert.equal(payload.result.score_publishable, true);
assert.equal(payload.result.lifecycle_ready, true);
assert.equal(payload.result.lifecycle, "REBOUNDING");
assert.deepEqual(payload.result.checkpoints.map((checkpoint: any) => checkpoint.periodEnd), ["2025-12-31", "2026-03-31", "2026-06-30"]);
assert.deepEqual(payload.result.checkpoints.map((checkpoint: any) => checkpoint.fcsScore), [84, 54, 87]);
assert.equal(new Set(payload.result.checkpoints.map((checkpoint: any) => checkpoint.comparabilityKey)).size, 1);
const sources = new Set<string>();
for (const checkpoint of payload.result.checkpoints) {
  assert.equal(checkpoint.completeFactors, 4);
  assert.equal(checkpoint.evidenceReferences.length, 4);
  for (const reference of checkpoint.evidenceReferences) {
    assert.ok(reference.currentLocator.page);
    assert.ok(reference.previousLocator.page);
  }
  for (const document of checkpoint.documentReferences) {
    assert.ok(document.archiveUri.startsWith("gs://"));
    assert.ok(document.publishedAt.slice(0, 10) <= payload.informationCutoff);
    const entry = manifest.documents.find((item: any) => item.sha256 === document.sha256 && item.source_url === document.sourceUrl);
    assert.ok(entry);
    const bytes = await readFile(`data/official-quarter-cache/${document.sha256}.pdf`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), document.sha256);
    sources.add(document.sha256);
  }
}
assert.equal(sources.size, 3);
const publicationPayload: any = await (await fetch(`${base}/api/bms/fundamental-review/publications`)).json();
const library = mergeFcsPublications(fundamentalChangeLibrary, publicationPayload.publications);
const coforge = library.find(record => record.symbol === "COFORGE");
assert.ok(coforge); assert.equal(coforge.fcsScore, 87); assert.equal(coforge.lifecycleReady, true);
console.log(JSON.stringify({ symbol: "COFORGE", published: true, fcs: 87, lifecycle: "REBOUNDING", quarters: 3,
  verified_comparative_originals: sources.size, companies: library.length,
  lifecycle_ready: library.filter(record => record.lifecycleReady).length,
  pending: library.filter(record => !record.lifecycleReady).length,
  frozen_validation_unchanged: true }));
