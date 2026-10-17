// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tailoringInput, selection } from "./fixtures/tailoring";
vi.mock("server-only", () => ({}));
const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: generate }; } }));
import { analyzeJobWithGemini, generateResumeWithGemini } from "@/lib/ai/tailoring";
import { validateResumeWithGemini } from "@/lib/ai/validation";
import { inspectResume } from "@/lib/validation/deterministic";
beforeEach(() => { vi.stubEnv("GEMINI_API_KEY", "test-only"); vi.stubEnv("GEMINI_MODEL", ""); generate.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const response = (data: unknown) => ({ text: JSON.stringify(data && typeof data === "object" && "experience" in data ? { jobAnalysis: tailoringInput().jobAnalysis, selection: data } : data), candidates: [{ finishReason: "STOP" }] });
describe("Gemini tailoring", () => {
  it("analyzes jobs with structured output and no profile data", async () => {
    generate.mockResolvedValue(response(tailoringInput().jobAnalysis));
    const job = await analyzeJobWithGemini({ jobDescription: "A React engineering position." });
    expect(job.requiredSkills).toContain("React");
    const call = generate.mock.calls[0][0];
    expect(call.model).toBe("gemini-3.5-flash-lite");
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
    expect(call.config.systemInstruction).toContain("Shortening is useful when it removes repetition or low-value detail. It is not the primary objective.");
    const payload = JSON.parse(call.contents[0].parts[0].text);
    expect(payload.contentPlan).not.toHaveProperty("targetBullets");
    expect(payload.contentPlan).not.toHaveProperty("minimumBullets");
    expect(call.config.responseJsonSchema.properties).not.toHaveProperty("changeExplanation");
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
  it("returns a sparse draft with exact advisory reasons instead of revising or rejecting it", async () => {
    const input = tailoringInput(); input.settings.targetLength = "two-pages";
    input.profile.experience[0].responsibilities = Array.from({ length: 8 }, (_, i) => ({ id: `fact-${i + 10}`, text: `Implemented a distinct React application feature ${i}.` }));
    const sparse = selection(); sparse.experience[0].bullets[0].evidenceIds = ["fact-10"];
    generate.mockResolvedValue(response(sparse));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await generateResumeWithGemini(input);
      expect(result.experience[0].bullets).toHaveLength(1);
      expect(result.qualityWarnings).toEqual(expect.arrayContaining([
        expect.stringContaining("only 1 distinct bullets"), expect.stringContaining("only 1 source facts"),
      ]));
      expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ event: "quality_warnings", reasons: result.qualityWarnings });
      expect(result.validation.status).toBe("pending-semantic-review");
      expect(generate).toHaveBeenCalledTimes(1);
    } finally { warn.mockRestore(); }
  });
  it("preserves duplicate-bullet and copied-summary warnings without blocking the draft", async () => {
    const input = tailoringInput(); input.profile.summary = "Verified original summary ".repeat(10).trim();
    const output = selection(); output.summary = input.profile.summary;
    output.experience[0].bullets.push({ ...output.experience[0].bullets[0] });
    generate.mockResolvedValue(response(output));
    const result = await generateResumeWithGemini(input);
    expect(result.qualityWarnings).toEqual(expect.arrayContaining([
      expect.stringContaining("duplicated bullets"), expect.stringContaining("fresh job-specific summary"),
    ]));
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("repairs a schema-invalid draft once and still enforces factual assembly", async () => {
    const oversized = selection(); oversized.headline = "x".repeat(161);
    generate.mockResolvedValueOnce(response(oversized)).mockResolvedValueOnce(response(selection()));
    const result = await generateResumeWithGemini(tailoringInput());
    expect(result.headline).toBe(selection().headline);
    expect(generate).toHaveBeenCalledTimes(2);
    const repair = JSON.parse(generate.mock.calls[1][0].contents[0].parts[0].text);
    expect(repair.schemaIssues).toEqual(expect.arrayContaining([expect.objectContaining({ path: "selection.headline", code: "too_big", maximum: 160 })]));
    expect(repair.previousInvalidDraft).toBeDefined();
    expect(result.validation.status).toBe("pending-semantic-review");
  });
  it("stops after two schema-invalid drafts", async () => {
    const oversized = selection(); oversized.headline = "x".repeat(161);
    generate.mockResolvedValue(response(oversized));
    await expect(generateResumeWithGemini(tailoringInput())).rejects.toMatchObject({ code: "INVALID_AI_RESPONSE" });
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

it("uses exactly two provider calls for combined writing and an independent successful factual review", async () => {
  const input = tailoringInput();
  generate.mockResolvedValueOnce(response(selection()));
  const resume = await generateResumeWithGemini(input);
  const { claims } = inspectResume(input.profile, resume);
  generate.mockResolvedValueOnce(response({ claims: claims.map(({ fieldPath }) => ({ fieldPath, outcome: "supported", message: "Supported by the scoped evidence." })) }));
  const reviewed = await validateResumeWithGemini({ profile: input.profile, resume, correct: true });
  expect(reviewed.validation.status).toBe("passed");
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[0][0].config.responseJsonSchema.properties).toHaveProperty("jobAnalysis");
  expect(generate.mock.calls[1][0].config.systemInstruction).toContain("Evaluate EVERY supplied claim");
});

it("retains more than sixteen supported bullets in Automatic without a numeric depth warning", async () => {
  const input = tailoringInput(); const output = selection();
  for (const [index, role] of input.profile.experience.entries()) {
    role.responsibilities = Array.from({ length: 9 }, (_, i) => ({ id: `role-${index}-fact-${i}`, text: `Implemented distinct React application feature ${index}-${i}.` }));
  }
  output.experience = input.profile.experience.map((role) => ({ sourceId: role.id, bullets: role.responsibilities.map((fact) => ({ text: fact.text, evidenceIds: [fact.id] })) }));
  generate.mockResolvedValueOnce(response(output));
  const resume = await generateResumeWithGemini(input);
  expect(resume.experience.flatMap((role) => role.bullets)).toHaveLength(18);
  expect(resume.qualityWarnings).toBeUndefined();
  expect(generate).toHaveBeenCalledTimes(1);
});
