// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { limit, redisConfig, set, evaluate } = vi.hoisted(() => ({ limit: vi.fn(), redisConfig: vi.fn(), set: vi.fn(), evaluate: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: class { set = set; eval = evaluate; constructor(config: unknown) { redisConfig(config); } } }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
  limit = limit;
  static slidingWindow = vi.fn();
  static fixedWindow = vi.fn();
} }));
beforeEach(() => { vi.resetModules(); limit.mockReset(); set.mockReset().mockResolvedValue("OK"); evaluate.mockReset(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.test"); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-only"); vi.stubEnv("RATE_LIMIT_SALT", "test-only-secret"); });
afterEach(() => { vi.unstubAllEnvs(); });
const request = () => new Request("https://example.test/api/parse-resume", { headers: { "x-vercel-forwarded-for": "203.0.113.1" } });
describe("server rate limits", () => {
  it("accepts Vercel integration credentials when Upstash variables are absent", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.test"); vi.stubEnv("KV_REST_API_TOKEN", "kv-test-token");
    limit.mockResolvedValue({ success: true });
    const { enforceParseRateLimit } = await import("@/lib/api/rate-limit");
    await enforceParseRateLimit(request());
    expect(redisConfig).toHaveBeenLastCalledWith(expect.objectContaining({ url: "https://kv.example.test", token: "kv-test-token" }));
    expect(limit).toHaveBeenCalledTimes(2);
  });
  it("does not mix partial Upstash settings with KV credentials", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.test"); vi.stubEnv("KV_REST_API_TOKEN", "kv-test-token");
    const { enforceParseRateLimit } = await import("@/lib/api/rate-limit");
    await expect(enforceParseRateLimit(request())).rejects.toMatchObject({ status: 503 });
    expect(limit).not.toHaveBeenCalled();
  });
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

it("reserves the worst-case run budget and lets three reviews finish after new-run admission closes", async () => {
  const api = await import("@/lib/api/rate-limit");
  const { savedResume } = await import("./fixtures/tailoring");
  const resume = savedResume();
  limit.mockResolvedValue({ success: true });
  const admission = await api.reserveTailoringRun(request());
  expect(limit.mock.calls[1]).toEqual(["all", { rate: 11 }]);
  const permit = await api.issueReviewPermit(admission, resume);
  expect(set).toHaveBeenCalledWith(expect.stringContaining(admission.runId), 3, { ex: 86400, nx: true });
  limit.mockClear().mockResolvedValue({ success: false, reset: Date.now() + 1000 });
  evaluate.mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValue(0);
  for (let i = 0; i < 3; i++) await api.enforceResumeReview(request(), resume, permit);
  expect(limit).not.toHaveBeenCalled();
  await expect(api.enforceResumeReview(request(), resume, permit)).rejects.toMatchObject({ status: 429 });
});
it("never grants free reviews to forged, expired, different-client or different-resume permits", async () => {
  const api = await import("@/lib/api/rate-limit");
  const { savedResume } = await import("./fixtures/tailoring"); const resume = savedResume();
  limit.mockResolvedValue({ success: true });
  const admission = await api.reserveTailoringRun(request());
  const permit = await api.issueReviewPermit(admission, resume);
  const expired = await api.issueReviewPermit({ ...admission, expiresAt: Date.now() - 1 }, resume);
  limit.mockClear();
  await api.enforceResumeReview(request(), resume, permit + "x");
  await api.enforceResumeReview(request(), { ...resume, id: "different" }, permit);
  await api.enforceResumeReview(new Request("https://example.test", { headers: { "x-vercel-forwarded-for": "203.0.113.2" } }), resume, permit);
  await api.enforceResumeReview(request(), resume, expired);
  expect(evaluate).not.toHaveBeenCalled();
  expect(limit).toHaveBeenCalledTimes(8);
  expect(limit.mock.calls.filter(([id]) => id === "all").every(([, config]) => config.rate === 3)).toBe(true);
});
it("atomically limits concurrent reserved review attempts and fails closed on Redis failure", async () => {
  const api = await import("@/lib/api/rate-limit");
  const { savedResume } = await import("./fixtures/tailoring"); const resume = savedResume();
  limit.mockResolvedValue({ success: true });
  const permit = await api.issueReviewPermit(await api.reserveTailoringRun(request()), resume);
  limit.mockClear().mockResolvedValue({ success: false, reset: Date.now() + 1000 });
  let remaining = 3; evaluate.mockImplementation(async () => remaining-- > 0 ? 1 : 0);
  const outcomes = await Promise.allSettled(Array.from({ length: 6 }, () => api.enforceResumeReview(request(), resume, permit)));
  expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(3);
  evaluate.mockRejectedValueOnce(new Error("offline"));
  await expect(api.enforceResumeReview(request(), resume, permit)).rejects.toMatchObject({ status: 503 });
});
