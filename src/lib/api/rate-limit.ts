import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import type { GeneratedResume } from "@/schemas/resume";
import { ApiError } from "./errors";

const REVIEW_ATTEMPTS = 3;
// Two writing calls + three review attempts of up to three provider calls each.
const RUN_UNITS = 2 + REVIEW_ATTEMPTS * 3;
const PERMIT_TTL_SECONDS = 86400;
let shared: { redis: Redis; clients: Map<string, Ratelimit>; global: Ratelimit } | undefined;
const local = new Map<string, { start: number; count: number }>();
const localReviews = new Map<string, { remaining: number; expiresAt: number }>();
const developmentSecret = randomBytes(32).toString("hex");
const unavailable = () => new ApiError(503, "RATE_LIMIT_UNAVAILABLE", "AI processing is temporarily unavailable. Please try again later.");
const development = () => process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";
function context(request: Request) {
  if (development()) return { clientKey: "development", salt: process.env.RATE_LIMIT_SALT || developmentSecret, development: true };
  const useUpstash = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  const url = (useUpstash ? process.env.UPSTASH_REDIS_REST_URL : process.env.KV_REST_API_URL)?.trim();
  const token = (useUpstash ? process.env.UPSTASH_REDIS_REST_TOKEN : process.env.KV_REST_API_TOKEN)?.trim();
  const salt = process.env.RATE_LIMIT_SALT;
  const ip = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (process.env.VERCEL !== "1" || !url || !token || !salt || !ip || !isIP(ip)) throw unavailable();
  if (!shared) {
    const redis = new Redis({ url, token, retry: { retries: 0 } });
    shared = { redis, clients: new Map(), global: new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(600, "1 d"), prefix: "resume:v2:provider-budget", analytics: false, ephemeralCache: false, timeout: 3000 }) };
  }
  return { clientKey: createHmac("sha256", salt).update(ip).digest("hex"), salt, development: false };
}
/** Admission counts starts; admitted reviews use their reserved allowance. */
export async function enforceAiRateLimit(request: Request, group = "standalone", units = 1): Promise<void> {
  try {
    const identity = context(request);
    if (identity.development) {
      let bucket = local.get(group);
      if (!bucket || Date.now() - bucket.start >= 60_000) { bucket = { start: Date.now(), count: 0 }; local.set(group, bucket); }
      if (++bucket.count > 5) throw new ApiError(429, "RATE_LIMITED", "Too many AI requests. Try again in a minute.", 60);
      return;
    }
    const service = shared!;
    let client = service.clients.get(group);
    if (!client) { client = new Ratelimit({ redis: service.redis, limiter: Ratelimit.slidingWindow(5, "10 m"), prefix: `resume:v2:admission:${group}`, analytics: false, ephemeralCache: false, timeout: 3000 }); service.clients.set(group, client); }
    const limit = await client.limit(identity.clientKey);
    if (limit.reason === "timeout") throw unavailable();
    if (!limit.success) throw new ApiError(429, "RATE_LIMITED", group === "run" ? "Too many new tailoring runs. Wait before starting another; saved drafts can still be reviewed." : "Too many AI requests. Please try again later.", Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000)));
    const budget = await service.global.limit("all", { rate: units });
    if (budget.reason === "timeout") throw unavailable();
    if (!budget.success) throw new ApiError(429, "DAILY_LIMIT_REACHED", "The daily AI budget has been reserved. Existing runs can finish their reserved factual reviews; try new runs tomorrow.", Math.max(1, Math.ceil((budget.reset - Date.now()) / 1000)));
  } catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
}
export const enforceParseRateLimit = (request: Request) => enforceAiRateLimit(request);
export async function reserveTailoringRun(request: Request) {
  await enforceAiRateLimit(request, "run", RUN_UNITS);
  return { ...context(request), runId: crypto.randomUUID(), expiresAt: Date.now() + PERMIT_TTL_SECONDS * 1000 };
}
const permitSchema = z.object({ runId: z.uuid(), clientKey: z.string().max(128), resumeId: z.string().max(128), profileId: z.string().max(128), profileVersion: z.number().int().positive(), expiresAt: z.number().int().positive() }).strict();
const signature = (body: string, salt: string) => createHmac("sha256", salt).update(`resume-review:v2:${body}`).digest("hex");
const permitKey = (id: string) => `resume:v2:reserved-review:${id}`;
export async function issueReviewPermit(admission: Awaited<ReturnType<typeof reserveTailoringRun>>, resume: GeneratedResume): Promise<string> {
  try {
    const payload = { runId: admission.runId, expiresAt: admission.expiresAt, clientKey: admission.clientKey, resumeId: resume.id, profileId: resume.profileId, profileVersion: resume.profileVersion };
    if (admission.development) {
      for (const [id, value] of localReviews) if (value.expiresAt < Date.now()) localReviews.delete(id);
      localReviews.set(admission.runId, { remaining: REVIEW_ATTEMPTS, expiresAt: admission.expiresAt });
    } else if (await shared!.redis.set(permitKey(admission.runId), REVIEW_ATTEMPTS, { ex: PERMIT_TTL_SECONDS, nx: true }) !== "OK") throw unavailable();
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${signature(body, admission.salt)}`;
  } catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
}
const consumeScript = "local n=tonumber(redis.call('GET',KEYS[1])); if not n or n<=0 then return 0 end; redis.call('DECR',KEYS[1]); return 1";
export async function enforceResumeReview(request: Request, resume: GeneratedResume, permit?: string): Promise<void> {
  try {
    const identity = context(request);
    if (permit) {
      const [body, signed, extra] = permit.split(".");
      if (!body || !signed || extra || !/^[a-f0-9]{64}$/.test(signed) || !timingSafeEqual(Buffer.from(signed, "hex"), Buffer.from(signature(body, identity.salt), "hex"))) { await enforceAiRateLimit(request, "review", 3); return; }
      const parsed = permitSchema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
      if (!parsed.success) throw new ApiError(403, "INVALID_REVIEW_PERMIT", "This review allowance is invalid.");
      const grant = parsed.data;
      if (grant.expiresAt > Date.now() && grant.clientKey === identity.clientKey && grant.resumeId === resume.id && grant.profileId === resume.profileId && grant.profileVersion === resume.profileVersion) {
        if (identity.development) {
          const counter = localReviews.get(grant.runId);
          if (counter && counter.remaining > 0) { counter.remaining--; return; }
        } else if (await shared!.redis.eval<[], number>(consumeScript, [permitKey(grant.runId)], []) === 1) return;
      }
    }
    // Old records, expired allowances and changed networks can request a separately
    // budgeted review. They never need to regenerate the resume.
    await enforceAiRateLimit(request, "review", 3);
  } catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
}
