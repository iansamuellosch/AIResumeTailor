import { ApiError } from "./errors";
import { MAX_REQUEST_BYTES } from "@/lib/parsing/limits";

export async function readLimitedJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new ApiError(415, "INVALID_CONTENT_TYPE", "Send a JSON request.");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, "INVALID_ORIGIN", "This request is not allowed.");
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_REQUEST_BYTES) throw new ApiError(413, "REQUEST_TOO_LARGE", "The extracted resume text is too large.");
  if (!request.body) throw new ApiError(400, "INVALID_REQUEST", "Resume text is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 10_000);
  let ended = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { ended = true; break; }
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        void reader.cancel();
        throw new ApiError(413, "REQUEST_TOO_LARGE", "The extracted resume text is too large.");
      }
      chunks.push(value);
    }
  } finally { clearTimeout(timeout); reader.releaseLock(); }
  if (timedOut || !ended || request.signal.aborted) throw new ApiError(408, "REQUEST_TIMEOUT", "The request timed out. Try again.");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new ApiError(400, "INVALID_JSON", "The request contains invalid JSON."); }
}
