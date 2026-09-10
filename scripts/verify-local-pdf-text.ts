import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import { extractPdfTextLocally } from "../src/pdf-text.ts";

const chunks: Buffer[] = [];
const pdf = new PDFDocument({ autoFirstPage: true });
pdf.on("data", chunk => chunks.push(Buffer.from(chunk)));
const complete = new Promise<void>(resolve => pdf.on("end", resolve));
pdf.fontSize(14).text("AGM NOTICE");
pdf.text("By order of the Board of Directors");
pdf.text("Pune: 06 May 2026");
pdf.end();
await complete;

const text = await extractPdfTextLocally(Buffer.concat(chunks), 1);
assert.match(text, /AGM NOTICE/);
assert.match(text, /By order of the Board of Directors/);
assert.match(text, /06 May 2026/);
console.log("PASS: local PDF text fallback extracts signed company notice text.");
