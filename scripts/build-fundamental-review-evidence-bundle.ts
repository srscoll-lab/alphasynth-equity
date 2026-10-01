import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const appRoot = process.cwd();
const v2Root = resolve(appRoot, "..", "alphasynth-bms-v2");
const sourceReports = [
  resolve(v2Root, "output", "local-official-reconstruction.json"),
  resolve(v2Root, "output", "acquired-official-reconstruction.json"),
  resolve(v2Root, "output", "remaining-official-reconstruction.json"),
];
const approvalSource = resolve(v2Root, "config", "five-company-evidence-approval-v1.json");
const reportOutput = resolve(appRoot, "data", "fundamental-review-approved-five-company-v2.json");
const approvalOutput = resolve(appRoot, "data", "fundamental-review-approved-five-company-v2-approval.json");

const reports = sourceReports.map((path) => JSON.parse(readFileSync(path, "utf8")));
const byDocumentId = new Map<string, Record<string, unknown>>();
for (const report of reports) {
  for (const document of report.documents ?? []) byDocumentId.set(document.document_id, document);
}
const bundle = {
  schema_version: "2.0.0",
  bundle_id: "approved-five-company-canonical-evidence-v2",
  generated_from: sourceReports.map((path) => path.replace(v2Root, "alphasynth-bms-v2")),
  documents: [...byDocumentId.values()],
  candidates: reports.flatMap((report) => report.candidates ?? []),
  validations: reports.flatMap((report) => report.validations ?? []),
};

mkdirSync(dirname(reportOutput), { recursive: true });
writeFileSync(reportOutput, `${JSON.stringify(bundle, null, 2)}\n`);
writeFileSync(approvalOutput, `${JSON.stringify(JSON.parse(readFileSync(approvalSource, "utf8")), null, 2)}\n`);
console.log(JSON.stringify({
  reportOutput,
  approvalOutput,
  candidates: bundle.candidates.length,
  documents: bundle.documents.length,
  validations: bundle.validations.length,
}, null, 2));
