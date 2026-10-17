// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { aiSchemaIssues, AiOutputValidationError, startAiTrace } from "@/lib/ai/trace";
import { errorResponse } from "@/lib/api/errors";
beforeEach(() => { vi.stubEnv("AI_DEBUG_LOG_PAYLOADS", "false"); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const records = () => [...vi.mocked(console.info).mock.calls, ...vi.mocked(console.warn).mock.calls].map(([line]) => JSON.parse(String(line)));
const request = { model: "test-model", contents: [{ text: "PRIVATE RESUME" }], config: { systemInstruction: "Instructions", responseJsonSchema: { type: "object" } } };
describe("AI request tracing", () => {
  it("logs correlated lifecycle metadata by default without request or response content", () => {
    const trace = startAiTrace("generate-resume", request);
    trace.response({ text: "PRIVATE RESPONSE", candidates: [{ finishReason: "STOP" }], usageMetadata: { totalTokenCount: 12 } }); trace.success();
    const events = records();
    expect(events.map((item) => item.event)).toEqual(["request", "response", "validated"]);
    expect(new Set(events.map((item) => item.callId)).size).toBe(1);
    expect(events[1]).toMatchObject({ operation: "generate-resume", finishReason: "STOP", outputCharacters: 16 });
    expect(JSON.stringify(events)).not.toContain("PRIVATE");
  });
  it("records full opt-in payloads in reconstructable chunks and redacts server credentials", () => {
    vi.stubEnv("AI_DEBUG_LOG_PAYLOADS", "true"); vi.stubEnv("GEMINI_API_KEY", "private-api-key"); vi.stubEnv("RATE_LIMIT_SALT", "private-salt");
    const contents = { text: "👩🏽‍💻文字".repeat(700) + " private-api-key private-salt" };
    const trace = startAiTrace("parse-resume", { ...request, contents });
    trace.response({ text: "RAW RESPONSE private-api-key" });
    const events = records(); const chunks = events.filter((item) => item.event === "payload" && item.direction === "request");
    expect(chunks.length).toBeGreaterThan(1);
    const reconstructed = JSON.parse(chunks.map((item) => item.jsonChunk).join(""));
    expect(reconstructed.contents.text).toBe(contents.text.replace("private-api-key", "[REDACTED]").replace("private-salt", "[REDACTED]"));
    expect(events.some((item) => item.event === "payload" && item.direction === "response")).toBe(true);
    expect(JSON.stringify(events)).not.toContain("private-api-key"); expect(JSON.stringify(events)).not.toContain("private-salt");
  });
  it("reports exact schema paths and limits without logging invalid values", () => {
    const result = z.object({ summary: z.string().max(5) }).safeParse({ summary: "PRIVATE RESUME" });
    if (result.success) throw new Error("Expected validation failure");
    const issues = aiSchemaIssues(result.error);
    expect(issues).toEqual([{ path: "summary", code: "too_big", maximum: 5, origin: "string" }]);
    const trace = startAiTrace("generate-resume", request); trace.validationFailed(issues); trace.failure(new AiOutputValidationError("PRIVATE RESUME", issues, trace.callId));
    expect(records().find((item) => item.event === "schema_validation_failed").issues).toEqual(issues);
    expect(JSON.stringify(records())).not.toContain("PRIVATE");
  });
  it("does not expose an invalid response in HTTP errors", async () => {
    const response = errorResponse(new AiOutputValidationError("PRIVATE AI RESPONSE", [{ path: "summary", code: "too_big" }], "call-reference"));
    const text = await response.text(); expect(text).toContain("call-reference"); expect(text).toContain("summary"); expect(text).not.toContain("PRIVATE");
  });
});
