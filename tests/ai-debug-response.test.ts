// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { withAiDebug } from "@/lib/ai/debug-response";
import { startAiTrace } from "@/lib/ai/trace";
import { ApiError, errorResponse } from "@/lib/api/errors";
beforeEach(() => { vi.stubEnv("AI_DEBUG_LOG_PAYLOADS", "false"); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function trace(text: string) {
  const event = startAiTrace("generate-resume", { model: "test-model", contents: [{ role: "user", parts: [{ text }] }], config: { systemInstruction: "Use only verified facts" } });
  event.response({ text: JSON.stringify({ summary: text }), candidates: [{ finishReason: "STOP" }] });
}
it("returns no debug content unless the server explicitly enables it", async () => {
  const response = await withAiDebug(async () => { trace("PRIVATE"); return Response.json({ success: true }); });
  expect(await response.json()).toEqual({ success: true });
});
it("returns redacted actual provider payloads on success and failed processing", async () => {
  vi.stubEnv("AI_DEBUG_LOG_PAYLOADS", "true"); vi.stubEnv("GEMINI_API_KEY", "test-api-secret");
  const response = await withAiDebug(async () => {
    trace("Own resume test-api-secret");
    return errorResponse(new ApiError(502, "INVALID_AI_RESPONSE", "Invalid AI response", 12));
  });
  const body = await response.json();
  expect(response.status).toBe(502); expect(response.headers.get("retry-after")).toBe("12");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(body.debug.calls).toHaveLength(2);
  expect(body.debug.calls[0]).toMatchObject({ direction: "request", operation: "generate-resume", payload: { model: "test-model", config: { systemInstruction: "Use only verified facts" } } });
  expect(JSON.stringify(body)).toContain("[REDACTED]"); expect(JSON.stringify(body)).not.toContain("test-api-secret");
});
it("isolates concurrent requests and includes every bounded repair call", async () => {
  vi.stubEnv("AI_DEBUG_LOG_PAYLOADS", "true");
  let release!: () => void; const ready = new Promise<void>((resolve) => { release = resolve; });
  const first = withAiDebug(async () => { trace("FIRST USER"); await ready; trace("FIRST REPAIR"); return Response.json({ success: true }); });
  const second = await withAiDebug(async () => { trace("SECOND USER"); return Response.json({ success: true }); });
  release(); const firstBody = await (await first).json(); const secondBody = await second.json();
  expect(firstBody.debug.calls).toHaveLength(4); expect(secondBody.debug.calls).toHaveLength(2);
  expect(JSON.stringify(firstBody)).not.toContain("SECOND USER"); expect(JSON.stringify(secondBody)).not.toContain("FIRST");
  trace("OUTSIDE REQUEST");
  const empty = await withAiDebug(async () => Response.json({ success: true }));
  expect((await empty.json()).debug.calls).toEqual([]);
});
