/// <reference lib="webworker" />
import { createResumeDocx } from "./docx";
import { createResumePdf, type PdfFonts } from "./pdf";
declare const self: DedicatedWorkerGlobalScope;
self.onmessage = async (event: MessageEvent<{ resume: unknown; format: "pdf" | "docx"; fonts?: PdfFonts }>) => {
  try {
    const { resume, format, fonts } = event.data;
    if (format !== "pdf" && format !== "docx") throw new Error("Unsupported export format.");
    if (format === "pdf" && !fonts) throw new Error("Could not load PDF fonts. Try again.");
    const result = format === "pdf" ? await createResumePdf(resume, fonts!) : { bytes: await createResumeDocx(resume), pageCount: undefined };
    const buffer = new Uint8Array(result.bytes).buffer;
    self.postMessage({ ok: true, buffer, pageCount: result.pageCount }, [buffer]);
  } catch (cause) { self.postMessage({ ok: false, error: cause instanceof Error ? cause.message : "Document export failed. Your saved resume is unchanged. Try again." }); }
};
