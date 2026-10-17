import { aiDebugSchema } from "@/schemas/ai-debug";

function parsedJson(text: unknown): unknown {
  if (typeof text !== "string") return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

/** Logs provider traces returned by an opted-in server, never API credentials. */
export function logBrowserAiDebug(response: unknown) {
  if (!response || typeof response !== "object" || !("debug" in response)) return;
  const debug = aiDebugSchema.safeParse(response.debug);
  if (!debug.success) return;
  for (const call of debug.data.calls) {
    console.groupCollapsed(`[Gemini] ${call.operation} · ${call.direction} · ${call.callId}`);
    try {
      console.log("Payload", call.payload);
      if (call.payload && typeof call.payload === "object") {
        const payload = call.payload as Record<string, unknown>;
        const parsed = parsedJson(payload.text);
        if (parsed !== undefined) console.log("Parsed response", parsed);
        if (Array.isArray(payload.contents)) {
          for (const content of payload.contents) {
            if (content && typeof content === "object" && Array.isArray(content.parts)) {
              for (const part of content.parts) {
                const input = parsedJson(part?.text);
                if (input !== undefined) console.log("Parsed input", input);
              }
            }
          }
        }
      }
      if (call.truncated) console.warn("This debug payload was truncated.");
    } finally { console.groupEnd(); }
  }
  if ("success" in response && response.success === false && "error" in response) console.warn("[Gemini] Request failed", response.error);
}
