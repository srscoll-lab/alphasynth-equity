import { readFile } from "node:fs/promises";

const [path, expression] = process.argv.slice(2);
if (!path || !expression) throw new Error("Usage: inspect-pdf-pages <pdf> <regular-expression>");
const promiseConstructor = Promise as typeof Promise & { withResolvers?: <T>() => any };
if (!promiseConstructor.withResolvers) promiseConstructor.withResolvers = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const document = await getDocument({ data: new Uint8Array(await readFile(path)), useSystemFonts: true }).promise;
const pattern = new RegExp(expression, "i");
for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
  const page = await document.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = content.items.filter((item: any) => "str" in item).map((item: any) => item.str).join(" ");
  if (pattern.test(text)) console.log(JSON.stringify({ page: pageNumber, text: text.slice(0, 1000) }));
  page.cleanup();
}
await document.cleanup();
