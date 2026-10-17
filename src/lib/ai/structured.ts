import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { providerError } from "./provider-error";
import { toGeminiJsonSchema } from "./json-schema";

export async function requestStructured<T>(schema: z.ZodType<T>, instructions: string, data: unknown, signal?: AbortSignal): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiError(503, "AI_NOT_CONFIGURED", "AI processing is not configured. Please try again later. Your local data is preserved.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 45_000);
  try {
    if (controller.signal.aborted) throw new Error("Aborted");
    const result = await new GoogleGenAI({ apiKey }).models.generateContent({
      model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
      contents: [{ role: "user", parts: [{ text: JSON.stringify(data) }] }],
      config: {
        systemInstruction: instructions, responseMimeType: "application/json", responseJsonSchema: toGeminiJsonSchema(schema),
        maxOutputTokens: 16000, abortSignal: controller.signal,
        httpOptions: { timeout: 45_000, retryOptions: { attempts: 1 } },
      },
    });
    if (controller.signal.aborted) throw new Error("Aborted");
    if (!result.text || result.text.length > 300_000 || result.candidates?.[0]?.finishReason !== "STOP") throw new ApiError(502, "INVALID_AI_RESPONSE", "AI returned an incomplete response. Try again.");
    try { return schema.parse(JSON.parse(result.text)); }
    catch { throw new ApiError(502, "INVALID_AI_RESPONSE", "AI returned content that could not be validated. Try again."); }
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError(504, "AI_TIMEOUT", "AI processing timed out. Your local data is preserved. Try again.");
    if (error instanceof ApiError) throw error;
    throw providerError(error);
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
