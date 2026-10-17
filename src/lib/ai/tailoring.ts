import "server-only";
import { jobAnalysisSchema } from "@/schemas/job";
import { resumeSelectionSchema, type GenerateResumeInput } from "@/schemas/resume";
import { analyzeJobRequestSchema } from "@/schemas/job";
import type { z } from "zod";
import { requestStructured } from "./structured";
import { JOB_ANALYSIS_INSTRUCTIONS, RESUME_GENERATION_INSTRUCTIONS } from "./prompts";
import { selectEvidence } from "@/lib/generation/evidence";
import { assembleResume } from "@/lib/generation/assemble";

export function analyzeJobWithGemini(input: z.infer<typeof analyzeJobRequestSchema>, signal?: AbortSignal) {
  return requestStructured(jobAnalysisSchema, JOB_ANALYSIS_INSTRUCTIONS, input, signal);
}
export async function generateResumeWithGemini(input: GenerateResumeInput, signal?: AbortSignal) {
  const evidence = selectEvidence(input.profile, input.jobAnalysis, input.settings);
  // Contact details, links, private notes on unrelated facts, and lifecycle metadata are excluded.
  const selection = await requestStructured(resumeSelectionSchema, RESUME_GENERATION_INSTRUCTIONS, {
    evidence, jobAnalysis: input.jobAnalysis, settings: input.settings, notes: input.notes,
  }, signal);
  return assembleResume(input, evidence, selection);
}
