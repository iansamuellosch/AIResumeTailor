// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: generate }; } }));
import { parseResumeWithGemini } from "@/lib/ai/gemini";
import { createEmptyProfile } from "@/schemas/profile";
beforeEach(() => { vi.stubEnv("GEMINI_API_KEY", "test-only-key"); generate.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("Gemini structured parsing", () => {
  it("requests JSON output and converts valid content to a draft", async () => {
    const input = createEmptyProfile(); input.personalInfo.fullName = "Alex Doe";
    generate.mockResolvedValue({ text: JSON.stringify(input), candidates: [{ finishReason: "STOP" }] });
    const profile = await parseResumeWithGemini("Alex Doe Software Engineer");
    expect(profile.status).toBe("draft");
    expect(profile.verifiedAt).toBeUndefined();
    expect(generate.mock.calls[0][0].config.responseJsonSchema.type).toBe("object");
    expect(generate.mock.calls[0][0].config.systemInstruction).toContain("Do not invent");
  });
  it.each([{ text: "not JSON", candidates: [{ finishReason: "STOP" }] }, { text: "{}", candidates: [{ finishReason: "STOP" }] }, { text: "{}", candidates: [{ finishReason: "MAX_TOKENS" }] }])("rejects invalid or truncated AI responses", async (response) => {
    generate.mockResolvedValue(response);
    await expect(parseResumeWithGemini("Example resume text")).rejects.toMatchObject({ code: "INVALID_AI_RESPONSE" });
  });
  it("requires a server API key and hides provider failures", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(parseResumeWithGemini("Example resume text")).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("GEMINI_API_KEY", "test-only-key");
    generate.mockRejectedValue(new Error("private content from provider"));
    await expect(parseResumeWithGemini("Example resume text")).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
  it("aborts stalled requests", async () => {
    vi.useFakeTimers();
    generate.mockImplementation(({ config }) => new Promise((_, reject) => config.abortSignal.addEventListener("abort", () => reject(new Error("aborted")))));
    const pending = expect(parseResumeWithGemini("Example resume text")).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(45_000);
    await pending;
  });
});
