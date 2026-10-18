import { resumeTemplates } from "@/lib/resume/templates";
import { z } from "zod";
import { assertExportable, exportFilename, type ExportFormat } from "./document";
import { downloadBlob } from "./download";
const resultSchema = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), buffer: z.instanceof(ArrayBuffer), pageCount: z.number().int().positive().optional() }), z.object({ ok: z.literal(false), error: z.string().max(1000) })]);
export async function downloadResume(input: unknown, format: ExportFormat): Promise<{ pageCount?: number }> {
  const resume = assertExportable(input);
  let fonts: { regular: Uint8Array; bold: Uint8Array } | undefined;
  if (format === "pdf") {
    try {
      const responses = await Promise.all(["Regular", "Bold"].map((weight) => fetch(`/fonts/${resumeTemplates[resume.settings.template].fontAsset}-${weight}.ttf`, { signal: AbortSignal.timeout(15000) })));
      if (responses.some((response) => !response.ok)) throw new Error("Font request failed");
      const [regular, bold] = await Promise.all(responses.map((response) => response.arrayBuffer())); fonts = { regular: new Uint8Array(regular), bold: new Uint8Array(bold) };
    } catch { throw new Error("Could not load PDF fonts. Check your connection and retry. Your resume is unchanged."); }
  }
  const result = await new Promise<{ buffer: ArrayBuffer; pageCount?: number }>((resolve, reject) => {
    const worker = new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { clearTimeout(timer); worker.terminate(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Document export took too long. Shorten the resume or try again.")); }, 45000);
    worker.onerror = () => { cleanup(); reject(new Error("Document export failed. Your saved resume is unchanged. Try again.")); };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      cleanup(); const parsed = resultSchema.safeParse(event.data);
      if (!parsed.success) reject(new Error("Document export returned an invalid result. Try again."));
      else if (!parsed.data.ok) reject(new Error(parsed.data.error));
      else if (!parsed.data.buffer.byteLength || (format === "pdf" && !parsed.data.pageCount)) reject(new Error("Document export returned an incomplete file. Try again."));
      else resolve(parsed.data);
    };
    try { worker.postMessage({ resume, format, fonts }); }
    catch { cleanup(); reject(new Error("Could not start document export. Try again.")); }
  });
  downloadBlob(new Blob([result.buffer], { type: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), exportFilename(resume, format));
  return { pageCount: result.pageCount };
}
