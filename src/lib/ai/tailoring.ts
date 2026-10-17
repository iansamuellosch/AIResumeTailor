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
import { AiOutputValidationError } from "./trace";

export function analyzeJobWithGemini(input: z.infer<typeof analyzeJobRequestSchema>, signal?: AbortSignal) {
  return requestStructured(jobAnalysisSchema, JOB_ANALYSIS_INSTRUCTIONS, input, signal, "analyze-job");
}
export async function generateResumeWithGemini(input: GenerateResumeInput, signal?: AbortSignal) {
  const evidence = selectEvidence(input.profile, input.jobAnalysis, input.settings);
  // Contact details, links, private notes on unrelated facts, and lifecycle metadata are excluded.
  const data = { evidence, contentPlan: contentPlan(evidence, input.settings), jobAnalysis: input.jobAnalysis, settings: input.settings, notes: input.notes };
  let revision: Record<string, unknown> = {};
  // Two calls total: the second repairs structure OR coverage, never an unbounded loop.
  for (let attempt = 0; attempt < 2; attempt++) {
    let selection;
    try {
      selection = await requestStructured(resumeSelectionSchema, RESUME_GENERATION_INSTRUCTIONS, { ...data, ...revision }, signal, attempt ? "revise-resume" : "generate-resume");
    } catch (error) {
      if (attempt === 0 && error instanceof AiOutputValidationError) {
        revision = { previousInvalidDraft: error.responseText, schemaIssues: error.issues, revisionRequirements: ["Correct the schema errors while preserving supported facts. Follow contentPlan.outputLimits. Do not invent, truncate strings blindly, or drop evidence to hide errors."] };
        continue;
      }
      throw error;
    }
    const resume = assembleResume(input, evidence, selection);
    const issues = selectionQualityIssues(evidence, input.settings, selection);
    if (!issues.length) return resume;
    revision = { previousDraft: selection, revisionRequirements: issues };
  }
  throw new ApiError(422, "INSUFFICIENT_TAILORING", "The draft omitted too much useful profile information or repeated generic content, so it was not saved. Try generating again. Your approved profile is preserved.");
}
