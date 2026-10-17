// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
  limit = limit;
  static slidingWindow = vi.fn();
  static fixedWindow = vi.fn();
} }));
beforeEach(() => { vi.resetModules(); limit.mockReset(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.test"); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-only"); vi.stubEnv("RATE_LIMIT_SALT", "test-only-secret"); });
afterEach(() => { vi.unstubAllEnvs(); });
const request = () => new Request("https://example.test/api/parse-resume", { headers: { "x-vercel-forwarded-for": "203.0.113.1" } });
describe("server rate limits", () => {
  it("uses shared limits and hashes the client address", async () => {
    limit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });
    const { enforceParseRateLimit } = await import("@/lib/api/rate-limit");
    await enforceParseRateLimit(request());
    expect(limit).toHaveBeenCalledTimes(2);
    expect(limit.mock.calls[0][0]).toMatch(/^[a-f0-9]{64}$/);
    expect(limit.mock.calls[1][0]).toBe("all");
  });
  it("fails closed when production config or a trusted proxy is missing", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { enforceParseRateLimit } = await import("@/lib/api/rate-limit");
    await expect(enforceParseRateLimit(request())).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-only"); vi.stubEnv("VERCEL", "0");
    await expect(enforceParseRateLimit(request())).rejects.toMatchObject({ status: 503 });
    expect(limit).not.toHaveBeenCalled();
  });
  it("blocks client and daily limits", async () => {
    const { enforceParseRateLimit } = await import("@/lib/api/rate-limit");
    limit.mockResolvedValueOnce({ success: false, reset: Date.now() + 5000 });
    await expect(enforceParseRateLimit(request())).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    limit.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, reset: Date.now() + 5000 });
    await expect(enforceParseRateLimit(request())).rejects.toMatchObject({ status: 429, code: "DAILY_LIMIT_REACHED" });
  });
  it("does not allow AI calls when Redis times out or fails", async () => {
    const { enforceParseRateLimit } = await import("@/lib/api/rate-limit");
    limit.mockResolvedValueOnce({ success: true, reason: "timeout" });
    await expect(enforceParseRateLimit(request())).rejects.toMatchObject({ status: 503 });
    limit.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(enforceParseRateLimit(request())).rejects.toMatchObject({ status: 503 });
  });
  it("limits local development without relying on spoofable headers", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("VERCEL", "");
    const { enforceParseRateLimit } = await import("@/lib/api/rate-limit");
    for (let index = 0; index < 5; index++) await enforceParseRateLimit(request());
    await expect(enforceParseRateLimit(request())).rejects.toMatchObject({ status: 429 });
    expect(limit).not.toHaveBeenCalled();
  });
});
