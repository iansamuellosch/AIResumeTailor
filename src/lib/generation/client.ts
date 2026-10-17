import { z } from "zod";
import { apiErrorSchema } from "@/schemas/parse-resume";
import { jobAnalysisSchema } from "@/schemas/job";
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
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(json);
    throw new Error(error.success ? error.data.error.message : "AI processing failed. Try again.");
  }
  const result = schema.safeParse(json);
  if (!result.success) throw new Error("The server returned invalid content. No resume was saved. Try again.");
  return result.data;
}
export type GenerationStage = "Analyzing job description" | "Matching qualifications and generating resume" | "Validating facts and correcting unsupported wording" | "Saving resume locally";
export async function requestTailoredResume(profile: ProfessionalProfile, input: DashboardInput, progress: (stage: GenerationStage) => void, signal?: AbortSignal): Promise<GeneratedResume> {
  progress("Analyzing job description");
  const { data: { jobAnalysis } } = await post("/api/analyze-job", { jobDescription: input.jobDescription, company: input.company, jobTitle: input.jobTitle }, z.object({ success: z.literal(true), data: z.object({ jobAnalysis: jobAnalysisSchema }) }), signal);
  progress("Matching qualifications and generating resume");
  const { data: { resume } } = await post("/api/generate-resume", { profile, jobAnalysis, settings: input.settings, notes: input.notes, jobUrl: input.jobUrl }, z.object({ success: z.literal(true), data: z.object({ resume: generatedResumeSchema }) }), signal, 105_000);
  if (signal?.aborted) throw new Error("Generation cancelled. Your saved data is preserved.");
  // Never accept a response for a different approved profile snapshot.
  if (resume.profileId !== profile.id || resume.profileVersion !== profile.version) throw new Error("The resume does not match your approved profile. Try again.");
  progress("Validating facts and correcting unsupported wording");
  const reviewed = await requestResumeValidation(profile, resume, true, signal);
  if (reviewed.validation.status === "failed") throw new Error(`Factual validation rejected the generated resume. ${reviewed.validation.issues.map((issue) => `${issue.fieldPath}: ${issue.message}`).join(" ").slice(0, 2000)}`);
  return reviewed;
}

export async function requestResumeValidation(profile: ProfessionalProfile, resume: GeneratedResume, correct = false, signal?: AbortSignal): Promise<GeneratedResume> {
  const response = await post("/api/validate-resume", { profile, resume, correct }, z.object({ success: z.literal(true), data: z.object({ resume: generatedResumeSchema }) }), signal, 155_000);
  const result = response.data.resume;
  if (result.id !== resume.id || result.profileId !== profile.id || result.profileVersion !== profile.version || !result.validation.checkedAt || result.validation.status === "pending-semantic-review") throw new Error("The server returned an incomplete factual review. Try again.");
  return result;
}
