import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { AiDebugCall } from "@/schemas/ai-debug";

// Each request owns its trace: concurrent users never receive each other's data.
const debugCalls = new AsyncLocalStorage<AiDebugCall[]>();
export function recordBrowserAiDebug(call: AiDebugCall) {
  debugCalls.getStore()?.push(call);
}

/** Debug data returns only to the caller, only with the explicit server opt-in. */
export async function withAiDebug(handler: () => Promise<Response>): Promise<Response> {
  if (process.env.AI_DEBUG_LOG_PAYLOADS !== "true") return handler();
  return debugCalls.run([], async () => {
    const response = await handler();
    const body = await response.json();
    return Response.json({ ...body, debug: { calls: debugCalls.getStore()! } }, {
      status: response.status, headers: response.headers,
    });
  });
}
