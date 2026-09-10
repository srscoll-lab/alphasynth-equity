export async function extractPdfTextLocally(data: Uint8Array, maximumPages = 20): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  const pageLimit = Math.min(document.numPages, Math.max(1, maximumPages));
  try {
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let pageText = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        pageText += `${item.str}${item.hasEOL ? "\n" : " "}`;
      }
      pages.push(pageText.trim());
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages.filter(Boolean).join("\n\n");
}
