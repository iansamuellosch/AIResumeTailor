// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/validation", () => ({ validateResumeWithGemini: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({ enforceAiRateLimit: vi.fn() }));
import { POST } from "@/app/api/validate-resume/route";
import { validateResumeWithGemini } from "@/lib/ai/validation";
import { enforceAiRateLimit } from "@/lib/api/rate-limit";
import { ApiError } from "@/lib/api/errors";
import { tailoringInput, savedResume } from "./fixtures/tailoring";
const req = (body: unknown, headers = {}) => new Request("http://localhost/api/validate-resume", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(() => vi.resetAllMocks());
it("returns validation outcomes without caching private content", async () => {
  const resume = savedResume(); resume.validation = { status: "failed", checkedAt: new Date().toISOString(), issues: [{ id: "issue", severity: "error", fieldPath: "summary", message: "Unsupported claim", evidenceIds: [] }] };
  vi.mocked(validateResumeWithGemini).mockResolvedValue(resume);
  const response = await POST(req({ profile: tailoringInput().profile, resume }));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.json()).data.resume.validation.status).toBe("failed");
});
it("rejects invalid data, drafts, oversized bodies and foreign origins before review", async () => {
  const profile = tailoringInput().profile; const resume = savedResume();
  expect((await POST(req({}))).status).toBe(400);
  expect((await POST(req({ profile: { ...profile, status: "draft", verifiedAt: undefined }, resume }))).status).toBe(400);
  expect((await POST(req({}, { "Content-Length": "300000" }))).status).toBe(413);
  expect((await POST(req({}, { Origin: "https://elsewhere.test" }))).status).toBe(403);
  expect(validateResumeWithGemini).not.toHaveBeenCalled();
});
it("enforces shared limits and hides unexpected provider details", async () => {
  vi.mocked(enforceAiRateLimit).mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", "Try later", 60));
  const response = await POST(req({})); expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("60");
  vi.mocked(validateResumeWithGemini).mockRejectedValue(new Error("SECRET resume content"));
  const failure = await POST(req({ profile: tailoringInput().profile, resume: savedResume() }));
  expect(failure.status).toBe(500); expect(await failure.text()).not.toContain("SECRET");
});
