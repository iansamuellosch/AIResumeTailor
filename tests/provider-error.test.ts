// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { providerError } from "@/lib/ai/provider-error";
afterEach(() => vi.restoreAllMocks());
describe("safe provider failures", () => {
  it.each([
    [408, 504, "AI_TIMEOUT"], [504, 504, "AI_TIMEOUT"],
    [404, 502, "AI_MODEL_UNAVAILABLE"], [401, 502, "AI_ACCESS_DENIED"], [403, 502, "AI_ACCESS_DENIED"],
    [429, 503, "AI_QUOTA_EXCEEDED"], [400, 502, "AI_REQUEST_REJECTED"], [503, 502, "AI_UNAVAILABLE"],
  ])("maps provider %i without revealing content", (status, expectedStatus, code) => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = providerError({ status, message: "private resume and key", response: { body: "private" } });
    expect(error).toMatchObject({ status: expectedStatus, code });
    expect(error.message).not.toContain("private");
    expect(log).toHaveBeenCalledExactlyOnceWith("Gemini request failed", { providerStatus: status });
    if (status === 429) expect(error.retryAfter).toBe(60);
  });
  it("handles unknown client errors without logging their details", () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(providerError(new Error("secret"))).toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(log).toHaveBeenCalledExactlyOnceWith("Gemini request failed", { providerStatus: "unknown" });
  });
});
