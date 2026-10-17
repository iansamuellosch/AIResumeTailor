import { MAX_DOCUMENT_PAGES, MAX_TEXT_CHARACTERS } from "./limits";
import { normalizeExtractedText, validateDocxArchive, type ResumeFormat } from "./files";

self.onmessage = async (event: MessageEvent<{ data: ArrayBuffer; format: ResumeFormat; workerUrl: string }>) => {
  try {
    const { data, format, workerUrl } = event.data;
    let text: string;
    if (format === "pdf") {
      if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") throw new Error("This file is not a valid PDF.");
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      // Supply an explicit nested worker: PDF.js automatic setup expects window.
      const port = new Worker(workerUrl, { type: "module" });
      const worker = pdfjs.PDFWorker.create({ port });
      const task = pdfjs.getDocument({ data: new Uint8Array(data), worker, useSystemFonts: false, disableFontFace: true });
      try {
        const document = await task.promise;
        if (document.numPages > MAX_DOCUMENT_PAGES) throw new Error("Use a resume with 100 pages or fewer.");
        const pages: string[] = [];
        let length = 0;
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
          const page = await document.getPage(pageNumber);
          const content = await page.getTextContent();
          const pageText = content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
          length += pageText.length;
          if (length > MAX_TEXT_CHARACTERS) throw new Error("This resume contains too much text. Use a shorter document.");
          pages.push(pageText);
          page.cleanup();
        }
        text = pages.join("\n\n");
      } finally { await task.destroy(); worker.destroy(); port.terminate(); }
    } else {
      validateDocxArchive(data);
      const mammoth = await import("mammoth/mammoth.browser");
      text = (await mammoth.extractRawText({ arrayBuffer: data })).value;
    }
    self.postMessage({ ok: true, text: normalizeExtractedText(text) });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const message = name === "PasswordException" ? "Password-protected PDFs are not supported. Upload an unlocked copy."
      : name === "InvalidPDFException" ? "This PDF is corrupt. Save a new copy and try again."
      : error instanceof Error ? error.message : "Could not read this document. Try another file or create a draft manually.";
    self.postMessage({ ok: false, error: message });
  }
};
