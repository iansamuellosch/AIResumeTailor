import "server-only";
import { jobAnalysisSchema } from "@/schemas/job";
import { resumeSelectionSchema, type GenerateResumeInput } from "@/schemas/resume";
import { analyzeJobRequestSchema } from "@/schemas/job";
import type { z } from "zod";
import { requestStructured } from "./structured";
import { JOB_ANALYSIS_INSTRUCTIONS, RESUME_GENERATION_INSTRUCTIONS } from "./prompts";
import { selectEvidence } from "@/lib/generation/evidence";
import { assembleResume } from "@/lib/generation/assemble";
import { contentPlan, selectionQualityIssues } from "@/lib/generation/quality";
import { ApiError } from "@/lib/api/errors";

export function analyzeJobWithGemini(input: z.infer<typeof analyzeJobRequestSchema>, signal?: AbortSignal) {
  return requestStructured(jobAnalysisSchema, JOB_ANALYSIS_INSTRUCTIONS, input, signal);
}
export async function generateResumeWithGemini(input: GenerateResumeInput, signal?: AbortSignal) {
  const evidence = selectEvidence(input.profile, input.jobAnalysis, input.settings);
  // Contact details, links, private notes on unrelated facts, and lifecycle metadata are excluded.
  const data = { evidence, contentPlan: contentPlan(evidence, input.settings), jobAnalysis: input.jobAnalysis, settings: input.settings, notes: input.notes };
  let selection = await requestStructured(resumeSelectionSchema, RESUME_GENERATION_INSTRUCTIONS, data, signal);
  let resume = assembleResume(input, evidence, selection);
  const qualityIssues = selectionQualityIssues(evidence, input.settings, selection);
  if (qualityIssues.length) {
    // One bounded rewrite, before the separate full factual-validation workflow.
    selection = await requestStructured(resumeSelectionSchema, RESUME_GENERATION_INSTRUCTIONS, { ...data, previousDraft: selection, revisionRequirements: qualityIssues }, signal);
    resume = assembleResume(input, evidence, selection);
    if (selectionQualityIssues(evidence, input.settings, selection).length) throw new ApiError(422, "INSUFFICIENT_TAILORING", "The draft omitted too much useful profile information or repeated generic content, so it was not saved. Try generating again. Your approved profile is preserved.");
  }
  return resume;
}
