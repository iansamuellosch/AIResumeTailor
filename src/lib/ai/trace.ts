import "server-only";
import { z } from "zod";
import { recordBrowserAiDebug } from "./debug-response";
import { ApiError } from "@/lib/api/errors";

export type AiOperation = "parse-resume" | "analyze-job" | "generate-resume" | "revise-resume" | "review-facts" | "correct-facts" | "structured";
export interface AiSchemaIssue { path: string; code: string; maximum?: number; minimum?: number; expected?: string; origin?: string }
export function aiSchemaIssues(error: unknown): AiSchemaIssue[] {
  if (!(error instanceof z.ZodError)) return [{ path: "", code: error instanceof SyntaxError ? "invalid_json" : "invalid_content" }];
  return error.issues.slice(0, 100).map((issue) => {
    const detail = issue as unknown as Record<string, unknown>;
    return {
      path: issue.path.map(String).join("."), code: issue.code,
      ...(typeof detail.maximum === "number" ? { maximum: detail.maximum } : {}),
      ...(typeof detail.minimum === "number" ? { minimum: detail.minimum } : {}),
      ...(typeof detail.expected === "string" ? { expected: detail.expected } : {}),
      ...(typeof detail.origin === "string" ? { origin: detail.origin } : {}),
    };
  });
}

/** Supports one bounded rewrite. Raw text is excluded from ordinary API errors; opt-in debug traces are separate. */
export class AiOutputValidationError extends ApiError {
  constructor(public readonly responseText: string, public readonly issues: AiSchemaIssue[], public readonly callId: string) {
    super(502, "INVALID_AI_RESPONSE", `AI returned content that could not be validated${issues[0]?.path ? ` at ${issues[0].path}` : ""}. Reference: ${callId}. Try again.`);
  }
}

function redactCredentials(text: string): string {
  for (const key of ["GEMINI_API_KEY", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN", "KV_REST_API_READ_ONLY_TOKEN", "RATE_LIMIT_SALT"]) {
    const value = process.env[key];
    if (value) text = text.replaceAll(value, "[REDACTED]");
  }
  return text;
}

/** Metadata is always logged. Content requires the user's explicit debug switch. */
export function startAiTrace(operation: AiOperation, request: { model: string; contents: unknown; config: unknown }) {
  const callId = crypto.randomUUID(); const started = Date.now();
  const fullPayloads = process.env.AI_DEBUG_LOG_PAYLOADS === "true";
  function emit(event: string, fields: Record<string, unknown>, warning = false) {
    const message = JSON.stringify({ source: "gemini", event, callId, operation, ...fields });
    if (warning) console.warn(message); else console.info(message);
  }
  function payload(direction: "request" | "response" | "error", data: unknown) {
    if (!fullPayloads) return;
    const serialized = redactCredentials(JSON.stringify(data));
    // Bound pathological provider output; ordinary accepted output is <=300k chars.
    const limited = serialized.slice(0, 1_000_000);
    let browserPayload: unknown;
    try { browserPayload = JSON.parse(limited); } catch { browserPayload = limited; }
    recordBrowserAiDebug({ callId, operation, direction, payload: browserPayload, truncated: limited.length !== serialized.length });
    const parts: string[] = []; let part = ""; let bytes = 0;
    for (const char of limited) {
      const size = Buffer.byteLength(char);
      if (bytes + size > 2000) { parts.push(part); part = ""; bytes = 0; }
      part += char; bytes += size;
    }
    if (part) parts.push(part);
    parts.forEach((jsonChunk, index) => emit("payload", { direction, part: index + 1, totalParts: parts.length, truncated: limited.length !== serialized.length, jsonChunk }));
  }
  emit("request", { model: request.model, payloadLogging: fullPayloads, inputCharacters: JSON.stringify(request.contents).length });
  payload("request", request);
  return {
    callId,
    response(result: { text?: string; candidates?: { finishReason?: string }[]; usageMetadata?: unknown }) {
      emit("response", { elapsedMs: Date.now() - started, outputCharacters: result.text?.length ?? 0, finishReason: result.candidates?.[0]?.finishReason ?? "missing", usage: result.usageMetadata });
      payload("response", { text: result.text ?? "", finishReason: result.candidates?.[0]?.finishReason, usage: result.usageMetadata });
    },
    validationFailed(issues: AiSchemaIssue[]) { emit("schema_validation_failed", { issues }, true); },
    success() { emit("validated", { elapsedMs: Date.now() - started }); },
    failure(error: unknown) {
      const detail = error && typeof error === "object" ? error as Record<string, unknown> : {};
      emit("failed", { elapsedMs: Date.now() - started, status: typeof detail.status === "number" ? detail.status : undefined, code: error instanceof ApiError ? error.code : "PROVIDER_ERROR" }, true);
      payload("error", { name: error instanceof Error ? error.name : "ProviderError", status: detail.status, message: typeof detail.message === "string" ? detail.message : "Unknown error" });
    },
  };
}
