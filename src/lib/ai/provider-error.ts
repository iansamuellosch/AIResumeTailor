import "server-only";
import { ApiError } from "@/lib/api/errors";

/** Never expose or log provider messages, which may contain submitted content. */
export function providerError(error: unknown): ApiError {
  const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : undefined;
  console.warn("Gemini request failed", { providerStatus: status ?? "unknown" });
  if (status === 408 || status === 504) return new ApiError(504, "AI_TIMEOUT", "Google Gemini did not finish before its deadline. Your data is saved locally. Try again later.");
  if (status === 404) return new ApiError(502, "AI_MODEL_UNAVAILABLE", "The configured AI model is unavailable. Update GEMINI_MODEL in the server environment and redeploy. Your local data is preserved.");
  if (status === 401 || status === 403) return new ApiError(502, "AI_ACCESS_DENIED", "Google Gemini denied access. Check the server API key and its permissions. Your local data is preserved.");
  if (status === 429) return new ApiError(503, "AI_QUOTA_EXCEEDED", "Google Gemini's quota or request limit was reached. Check the Google project's usage limits before retrying. Your local data is preserved.", 60);
  if (status === 400) return new ApiError(502, "AI_REQUEST_REJECTED", "Google Gemini rejected the processing request. Check the server model configuration. Your local data is preserved.");
  return new ApiError(502, "AI_UNAVAILABLE", "AI processing is unavailable. Your local data is preserved. Try again later or create a draft manually.");
}
