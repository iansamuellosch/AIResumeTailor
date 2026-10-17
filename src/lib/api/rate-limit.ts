import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { ApiError } from "./errors";

let shared: { client: Ratelimit; global: Ratelimit } | undefined;
let local: { start: number; count: number } = { start: 0, count: 0 };

export async function enforceAiRateLimit(request: Request): Promise<void> {
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1") {
    // One shared development bucket; forwarded headers cannot bypass it.
    if (Date.now() - local.start >= 60_000) local = { start: Date.now(), count: 0 };
    if (++local.count > 5) throw new ApiError(429, "RATE_LIMITED", "Too many AI requests. Try again in a minute.", 60);
    return;
  }
  // Vercel's Upstash integration may provision KV_* rather than UPSTASH_*.
  // Select a complete credential family; never mix credentials across databases.
  const useUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  const url = (useUpstash ? process.env.UPSTASH_REDIS_REST_URL : process.env.KV_REST_API_URL)?.trim();
  const token = (useUpstash ? process.env.UPSTASH_REDIS_REST_TOKEN : process.env.KV_REST_API_TOKEN)?.trim();
  const salt = process.env.RATE_LIMIT_SALT;
  // Public production is supported on Vercel, whose proxy overwrites this header.
  // Never trust arbitrary X-Forwarded-For on an unconfigured host.
  const ip = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (process.env.VERCEL !== "1" || !url || !token || !salt || !ip || !isIP(ip)) {
    throw new ApiError(503, "RATE_LIMIT_UNAVAILABLE", "AI processing is temporarily unavailable. Please try again later.");
  }
  try {
    if (!shared) {
      const redis = new Redis({ url, token, retry: { retries: 0 } });
      shared = {
        client: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "10 m"), prefix: "resume:parse:client", analytics: false, ephemeralCache: false, timeout: 3000 }),
        global: new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(200, "1 d"), prefix: "resume:parse:budget", analytics: false, ephemeralCache: false, timeout: 3000 }),
      };
    }
    const key = createHmac("sha256", salt).update(ip).digest("hex");
    const client = await shared.client.limit(key);
    if (client.reason === "timeout") throw new Error("Rate limit timeout");
    if (!client.success) throw new ApiError(429, "RATE_LIMITED", "Too many AI requests. Please try again later.", Math.max(1, Math.ceil((client.reset - Date.now()) / 1000)));
    const budget = await shared.global.limit("all");
    if (budget.reason === "timeout") throw new Error("Rate limit timeout");
    if (!budget.success) throw new ApiError(429, "DAILY_LIMIT_REACHED", "The daily AI request limit has been reached. Please try again tomorrow.", Math.max(1, Math.ceil((budget.reset - Date.now()) / 1000)));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "RATE_LIMIT_UNAVAILABLE", "AI processing is temporarily unavailable. Please try again later.");
  }
}

// Parsing and tailoring share the same client and global budgets to prevent bypasses.
export const enforceParseRateLimit = enforceAiRateLimit;
