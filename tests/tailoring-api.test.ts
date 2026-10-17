// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { tailoringInput, savedResume } from "./fixtures/tailoring";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/tailoring", () => ({ analyzeJobWithGemini: vi.fn(), generateResumeWithGemini: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({ enforceAiRateLimit: vi.fn() }));
import { analyzeJobWithGemini, generateResumeWithGemini } from "@/lib/ai/tailoring";
import { enforceAiRateLimit } from "@/lib/api/rate-limit";
import { POST as analyze } from "@/app/api/analyze-job/route";
import { POST as generate } from "@/app/api/generate-resume/route";
beforeEach(() => vi.resetAllMocks());
const request = (body: unknown, headers = {}) => new Request("http://localhost/api/tailoring", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
describe("tailoring routes", () => {
  it("returns structured analysis and generated content without caching", async () => {
    const input = tailoringInput();
    vi.mocked(analyzeJobWithGemini).mockResolvedValue(input.jobAnalysis);
    vi.mocked(generateResumeWithGemini).mockResolvedValue(savedResume());
    const analysis = await analyze(request({ jobDescription: "React engineer building accessible applications." }));
    const result = await generate(request(input));
    for (const response of [analysis, result]) { expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); }
    expect((await analysis.json()).data.jobAnalysis.requiredSkills).toContain("React");
    expect((await result.json()).data.resume.experience[0].bullets[0].evidenceIds).toEqual(["fact-1"]);
    expect(enforceAiRateLimit).toHaveBeenCalledTimes(2);
  });
  it("rejects draft profiles and malformed job descriptions before AI", async () => {
    const input = tailoringInput();
    expect((await analyze(request({ jobDescription: "short" }))).status).toBe(400);
    expect((await generate(request({ ...input, profile: { ...input.profile, status: "draft", verifiedAt: undefined } }))).status).toBe(400);
    expect(generateResumeWithGemini).not.toHaveBeenCalled(); expect(analyzeJobWithGemini).not.toHaveBeenCalled();
  });
  it.each([analyze, generate])("enforces request guards and safe errors", async (route) => {
    expect((await route(request({}, { "Origin": "https://evil.example" }))).status).toBe(403);
    expect((await route(request({}, { "Content-Length": "300000" }))).status).toBe(413);
    expect((await route(request({}, { "Content-Type": "text/plain" }))).status).toBe(415);
    vi.mocked(enforceAiRateLimit).mockRejectedValue(new ApiError(429, "RATE_LIMITED", "Try again later.", 60));
    const response = await route(request({}));
    expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("60");
  });
  it("rejects unsupported evidence and hides unexpected provider details", async () => {
    vi.mocked(generateResumeWithGemini).mockRejectedValueOnce(new ApiError(422, "UNSUPPORTED_GENERATION", "Unsupported evidence."));
    expect((await generate(request(tailoringInput()))).status).toBe(422);
    vi.mocked(generateResumeWithGemini).mockRejectedValueOnce(new Error("SECRET personal data"));
    const response = await generate(request(tailoringInput()));
    expect(response.status).toBe(500); expect(await response.text()).not.toContain("SECRET");
  });
});
