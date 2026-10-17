// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "@/schemas/profile";
import { ApiError } from "@/lib/api/errors";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/gemini", () => ({ parseResumeWithGemini: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({ enforceParseRateLimit: vi.fn() }));
import { POST } from "@/app/api/parse-resume/route";
import { parseResumeWithGemini } from "@/lib/ai/gemini";
import { enforceParseRateLimit } from "@/lib/api/rate-limit";
const parse = vi.mocked(parseResumeWithGemini);
const limit = vi.mocked(enforceParseRateLimit);
function request(body: string, headers: Record<string, string> = {}) { return new Request("http://localhost/api/parse-resume", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body }); }
beforeEach(() => { vi.resetAllMocks(); });
describe("POST /api/parse-resume", () => {
  it("returns a structured draft and never caches personal data", async () => {
    parse.mockResolvedValue(createEmptyProfile());
    const response = await POST(request(JSON.stringify({ text: "Alex Doe, Software Engineer" })));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).data.profile.status).toBe("draft");
    expect(parse).toHaveBeenCalledWith("Alex Doe, Software Engineer", expect.any(AbortSignal));
  });
  it.each([
    ["{}", {}, 400], ["{", {}, 400],
    [JSON.stringify({ text: "x".repeat(60001) }), {}, 400],
    ["{}", { "Content-Type": "text/plain" }, 415],
    ["{}", { "Origin": "https://other.example" }, 403],
    ["{}", { "Content-Length": "300000" }, 413],
    [" ".repeat(270000), {}, 413],
  ])("rejects bad input without sending it to Gemini", async (body, headers, status) => {
    const response = await POST(request(body, headers));
    expect(response.status).toBe(status);
    expect((await response.json()).success).toBe(false);
    expect(parse).not.toHaveBeenCalled();
  });
  it("blocks excessive requests and includes a retry header", async () => {
    limit.mockRejectedValue(new ApiError(429, "RATE_LIMITED", "Please retry later.", 60));
    const response = await POST(request("{}"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(parse).not.toHaveBeenCalled();
  });
  it("returns safe errors without exposing provider or personal content", async () => {
    parse.mockRejectedValue(new Error("SECRET API KEY and personal resume content"));
    const response = await POST(request(JSON.stringify({ text: "Alex Doe, Software Engineer" })));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("SECRET");
  });
});
