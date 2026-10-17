import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { extractedProfileSchema, extractedDataToDraft } from "@/schemas/parse-resume";
import { RESUME_EXTRACTION_INSTRUCTIONS } from "./prompts";
import { ApiError } from "@/lib/api/errors";
import { providerError } from "./provider-error";

export async function parseResumeWithGemini(text: string, signal?: AbortSignal) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiError(503, "AI_NOT_CONFIGURED", "Resume parsing is not configured yet. You can create a draft manually or try again later.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 45_000);
  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
      contents: [{ role: "user", parts: [{ text: JSON.stringify({ resumeText: text }) }] }],
      config: {
        systemInstruction: RESUME_EXTRACTION_INSTRUCTIONS,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(extractedProfileSchema),
        maxOutputTokens: 16000,
        abortSignal: controller.signal,
        httpOptions: { timeout: 45_000, retryOptions: { attempts: 1 } },
      },
    });
    if (controller.signal.aborted) throw new ApiError(504, "AI_TIMEOUT", "AI processing timed out. Your file is saved locally. Try again.");
    if (!result.text || result.text.length > 300_000 || result.candidates?.[0]?.finishReason !== "STOP") throw new ApiError(502, "INVALID_AI_RESPONSE", "AI could not return a complete profile. Try again or create a draft manually.");
    try { return extractedDataToDraft(JSON.parse(result.text)); }
    catch { throw new ApiError(502, "INVALID_AI_RESPONSE", "AI returned information that could not be validated. Try again or create a draft manually."); }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError(504, "AI_TIMEOUT", "AI processing timed out. Your file is saved locally. Try again.");
    throw providerError(error);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
