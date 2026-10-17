// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tailoringInput, selection } from "./fixtures/tailoring";
vi.mock("server-only", () => ({}));
const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: generate }; } }));
import { analyzeJobWithGemini, generateResumeWithGemini } from "@/lib/ai/tailoring";
beforeEach(() => { vi.stubEnv("GEMINI_API_KEY", "test-only"); vi.stubEnv("GEMINI_MODEL", ""); generate.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const response = (data: unknown) => ({ text: JSON.stringify(data), candidates: [{ finishReason: "STOP" }] });
describe("Gemini tailoring", () => {
  it("analyzes jobs with structured output and no profile data", async () => {
    generate.mockResolvedValue(response(tailoringInput().jobAnalysis));
    const job = await analyzeJobWithGemini({ jobDescription: "A React engineering position." });
    expect(job.requiredSkills).toContain("React");
    const call = generate.mock.calls[0][0];
    expect(call.model).toBe("gemini-3.8-flash");
    expect(call.config).not.toHaveProperty("temperature");
    expect(call.config.responseJsonSchema.type).toBe("object");
    expect(call.config.systemInstruction).toContain("untrusted data");
    expect(call.contents[0].parts[0].text).not.toContain("alex@example.test");
  });
  it("generates from selected evidence without sending contact details", async () => {
    const input = tailoringInput(); generate.mockResolvedValue(response(selection()));
    const resume = await generateResumeWithGemini(input);
    const call = generate.mock.calls[0][0];
    expect(call.contents[0].parts[0].text).toContain("fact-1");
    expect(call.contents[0].parts[0].text).not.toContain(input.profile.personalInfo.email);
    expect(call.config.systemInstruction).toContain("Never invent");
    expect(resume.contact.email).toBe(input.profile.personalInfo.email);
  });
  it("rejects syntactically valid AI output with misattributed evidence", async () => {
    const output = selection(); output.experience[0].bullets[0].evidenceIds = ["fact-3"];
    generate.mockResolvedValue(response(output));
    await expect(generateResumeWithGemini(tailoringInput())).rejects.toMatchObject({ code: "UNSUPPORTED_GENERATION" });
  });
  it.each([{ text: "not json", candidates: [{ finishReason: "STOP" }] }, response({}), { ...response(selection()), candidates: [{ finishReason: "MAX_TOKENS" }] }])("rejects malformed and truncated output", async (value) => {
    generate.mockResolvedValue(value);
    await expect(generateResumeWithGemini(tailoringInput())).rejects.toMatchObject({ code: "INVALID_AI_RESPONSE" });
  });
  it("handles missing configuration, provider failures, and timeouts safely", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(generateResumeWithGemini(tailoringInput())).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("GEMINI_API_KEY", "test-only"); generate.mockRejectedValueOnce(new Error("secret"));
    await expect(generateResumeWithGemini(tailoringInput())).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    vi.useFakeTimers();
    generate.mockImplementation(({ config }) => new Promise((_, reject) => config.abortSignal.addEventListener("abort", () => reject(new Error("aborted")))));
    const pending = expect(generateResumeWithGemini(tailoringInput())).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(45_000); await pending;
  });
  it("does not call Gemini when the caller already cancelled", async () => {
    await expect(generateResumeWithGemini(tailoringInput(), AbortSignal.abort())).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    expect(generate).not.toHaveBeenCalled();
  });
  it("preserves configured model overrides and reports retired models safely", async () => {
    vi.stubEnv("GEMINI_MODEL", " custom-model ");
    generate.mockRejectedValue({ status: 404, message: "private provider details" });
    await expect(analyzeJobWithGemini({ jobDescription: "A React engineering position." })).rejects.toMatchObject({ code: "AI_MODEL_UNAVAILABLE", message: expect.not.stringContaining("private provider details") });
    expect(generate.mock.calls[0][0].model).toBe("custom-model");
  });
});
