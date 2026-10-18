import { logBrowserAiDebug } from "@/lib/ai/browser-debug";
import { z } from "zod";
import { apiErrorSchema } from "@/schemas/parse-resume";
import { generatedResumeSchema, type DashboardInput, type GeneratedResume } from "@/schemas/resume";
import type { ProfessionalProfile } from "@/schemas/profile";

async function post<T>(path: string, input: unknown, schema: z.ZodType<T>, signal?: AbortSignal, timeout = 55_000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout) });
  } catch {
    throw new Error(signal?.aborted ? "Generation cancelled. Your saved data is preserved." : "Could not complete AI processing. Check your connection and try again. Your saved data is preserved.");
  }
  const json: unknown = await response.json().catch(() => undefined);
  logBrowserAiDebug(json);
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(json);
    throw new Error(error.success ? error.data.error.message : "AI processing failed. Try again.");
  }
  const result = schema.safeParse(json);
  if (!result.success) throw new Error("The server returned invalid content. No resume was saved. Try again.");
  return result.data;
}
export type GenerationStage = "Analyzing job and generating resume" | "Validating facts and correcting unsupported wording" | "Saving resume locally";
export async function requestTailoredResume(profile: ProfessionalProfile, input: DashboardInput, progress: (stage: GenerationStage) => void, signal?: AbortSignal): Promise<{ resume: GeneratedResume; reviewPermit?: string }> {
  progress("Analyzing job and generating resume");
  const { data } = await post("/api/generate-resume", { ...input, profile }, z.object({ success: z.literal(true), data: z.object({ resume: generatedResumeSchema, reviewPermit: z.string().max(4096).optional() }) }), signal, 105_000);
  if (signal?.aborted) throw new Error("Generation cancelled. Your saved data is preserved.");
  if (data.resume.profileId !== profile.id || data.resume.profileVersion !== profile.version) throw new Error("The resume does not match your approved profile. Try again.");
  if (data.resume.qualityWarnings?.length) console.warn("[Gemini] Resume quality warnings", data.resume.qualityWarnings);
  return data;
}

export async function requestResumeValidation(profile: ProfessionalProfile, resume: GeneratedResume, correct = false, signal?: AbortSignal, reviewPermit?: string): Promise<GeneratedResume> {
  const response = await post("/api/validate-resume", { profile, resume, correct, reviewPermit }, z.object({ success: z.literal(true), data: z.object({ resume: generatedResumeSchema }) }), signal, 155_000);
  const result = response.data.resume;
  if (result.id !== resume.id || result.profileId !== profile.id || result.profileVersion !== profile.version || !result.validation.checkedAt || !["passed", "needs-review", "failed"].includes(result.validation.status)) throw new Error("The server returned an incomplete factual review. Try again.");
  return result;
}
