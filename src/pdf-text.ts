export async function extractPdfTextLocally(data: Uint8Array, maximumPages = 20): Promise<string> {
  // pdfjs-dist 6 uses the ES2024 Promise.withResolvers API during module
  // initialisation. Keep a small compatibility guard for older local runtimes;
  // production uses Node 22 where the API is native.
  const promiseConstructor = Promise as typeof Promise & {
    withResolvers?: <T>() => {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  };
  if (typeof promiseConstructor.withResolvers !== "function") {
    promiseConstructor.withResolvers = <T>() => {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, resolve, reject };
    };
  }
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
