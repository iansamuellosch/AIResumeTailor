import { z } from "zod";
import { EXTRACTION_TIMEOUT_MS } from "./limits";
import { normalizeExtractedText, validateResumeFile } from "./files";
const workerResponse = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), text: z.string() }), z.object({ ok: z.literal(false), error: z.string() })]);

/** Terminate expensive/corrupt document processing without blocking the UI. */
export async function extractResumeText(file: File): Promise<string> {
  const format = validateResumeFile(file);
  const data = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./extraction.worker.ts", import.meta.url), { type: "module" });
    const finish = (error?: Error, text?: string) => {
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error); else resolve(text!);
    };
    const timer = setTimeout(() => finish(new Error("Reading this document took too long. Try another file or create a draft manually.")), EXTRACTION_TIMEOUT_MS);
    worker.onerror = () => finish(new Error("Could not read this document. Try another file or create a draft manually."));
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const result = workerResponse.safeParse(event.data);
      if (!result.success) return finish(new Error("Could not read this document."));
      if (!result.data.ok) return finish(new Error(result.data.error));
      try { finish(undefined, normalizeExtractedText(result.data.text)); }
      catch (error) { finish(error instanceof Error ? error : new Error("Could not read this document.")); }
    };
    worker.postMessage({ data, format, workerUrl: new URL("/pdf.worker.min.mjs", window.location.origin).href }, [data]);
  });
}
