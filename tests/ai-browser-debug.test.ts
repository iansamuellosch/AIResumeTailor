import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { logBrowserAiDebug } from "@/lib/ai/browser-debug";
beforeEach(() => { vi.spyOn(console, "groupCollapsed").mockImplementation(() => {}); vi.spyOn(console, "groupEnd").mockImplementation(() => {}); vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
it("is silent when server debugging is disabled or debug data is malformed", () => {
  for (const body of [undefined, { success: true }, { debug: "invalid" }, { debug: { calls: [{}] } }]) logBrowserAiDebug(body);
  expect(console.log).not.toHaveBeenCalled(); expect(console.groupCollapsed).not.toHaveBeenCalled();
});
it("groups actual Gemini requests, replies, parsed JSON and failed calls in DevTools", () => {
  const request = { contents: [{ role: "user", parts: [{ text: JSON.stringify({ evidence: ["Verified fact"] }) }] }], config: { systemInstruction: "Instructions" } };
  logBrowserAiDebug({ success: false, error: { code: "INVALID_AI_RESPONSE", message: "Review failed" }, debug: { calls: [
    { callId: "call-1", operation: "generate-resume", direction: "request", payload: request, truncated: false },
    { callId: "call-1", operation: "generate-resume", direction: "response", payload: { text: JSON.stringify({ summary: "Tailored summary" }) }, truncated: false },
    { callId: "call-2", operation: "review-facts", direction: "error", payload: { message: "Timed out" }, truncated: true },
  ] } });
  expect(console.groupCollapsed).toHaveBeenCalledWith("[Gemini] generate-resume · request · call-1");
  expect(console.log).toHaveBeenCalledWith("Payload", request);
  expect(console.log).toHaveBeenCalledWith("Parsed input", { evidence: ["Verified fact"] });
  expect(console.log).toHaveBeenCalledWith("Parsed response", { summary: "Tailored summary" });
  expect(console.groupEnd).toHaveBeenCalledTimes(3);
  expect(console.warn).toHaveBeenCalledWith("[Gemini] Request failed", { code: "INVALID_AI_RESPONSE", message: "Review failed" });
});
it("keeps non-JSON and truncated model output inspectable", () => {
  logBrowserAiDebug({ debug: { calls: [{ callId: "call", operation: "parse-resume", direction: "response", payload: { text: "not JSON" }, truncated: true }] } });
  expect(console.log).toHaveBeenCalledWith("Payload", { text: "not JSON" });
  expect(console.warn).toHaveBeenCalledWith("This debug payload was truncated.");
});
