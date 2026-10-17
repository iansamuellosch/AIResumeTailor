import "server-only";
import { GoogleGenAI } from "@google/genai";
import { extractedProfileSchema, extractedDataToDraft } from "@/schemas/parse-resume";
import { RESUME_EXTRACTION_INSTRUCTIONS } from "./prompts";
import { ApiError } from "@/lib/api/errors";
import { providerError } from "./provider-error";
import { toGeminiJsonSchema } from "./json-schema";
import { aiSchemaIssues, startAiTrace } from "./trace";

export async function parseResumeWithGemini(text: string, signal?: AbortSignal) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiError(503, "AI_NOT_CONFIGURED", "Resume parsing is not configured yet. You can create a draft manually or try again later.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 45_000);
  let trace: ReturnType<typeof startAiTrace> | undefined;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const request = {
      model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
      contents: [{ role: "user", parts: [{ text: JSON.stringify({ resumeText: text }) }] }],
      config: {
        systemInstruction: RESUME_EXTRACTION_INSTRUCTIONS,
        responseMimeType: "application/json",
        responseJsonSchema: toGeminiJsonSchema(extractedProfileSchema),
        maxOutputTokens: 16000,
      },
    };
    if (controller.signal.aborted) throw new ApiError(504, "AI_TIMEOUT", "AI processing timed out. Your file is saved locally. Try again.");
    trace = startAiTrace("parse-resume", request);
    const result = await ai.models.generateContent({ ...request, config: { ...request.config, abortSignal: controller.signal, httpOptions: { timeout: 45_000, retryOptions: { attempts: 1 } } } });
    trace.response(result);
    if (controller.signal.aborted) throw new ApiError(504, "AI_TIMEOUT", "AI processing timed out. Your file is saved locally. Try again.");
    if (!result.text || result.text.length > 300_000 || result.candidates?.[0]?.finishReason !== "STOP") throw new ApiError(502, "INVALID_AI_RESPONSE", "AI could not return a complete profile. Try again or create a draft manually.");
    try { const draft = extractedDataToDraft(JSON.parse(result.text)); trace.success(); return draft; }
    catch (error) {
      trace.validationFailed(aiSchemaIssues(error));
      throw new ApiError(502, "INVALID_AI_RESPONSE", `AI returned information that could not be validated. Reference: ${trace.callId}. Try again or create a draft manually.`);
    }
  } catch (error) {
    trace?.failure(error);
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError(504, "AI_TIMEOUT", "AI processing timed out. Your file is saved locally. Try again.");
    throw providerError(error);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
