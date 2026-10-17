import "server-only";
import { jobAnalysisSchema } from "@/schemas/job";
import { tailoredContentSchema, type TailorResumeInput } from "@/schemas/resume";
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
export async function generateResumeWithGemini(input: TailorResumeInput, signal?: AbortSignal) {
  // Local text matching only prepares a broad evidence pool. Gemini analyzes the
  // actual requirements and writes the resume together in one structured response.
  const matchingContext = { jobTitle: input.jobTitle || "", requiredSkills: [], preferredSkills: [], keywords: [], qualifications: [], responsibilities: [input.jobDescription] };
  const evidence = selectEvidence(input.profile, matchingContext, input.settings);
  // Contact details, links, private notes on unrelated facts, and lifecycle metadata are excluded.
  const data = { jobDescription: input.jobDescription, company: input.company, jobTitle: input.jobTitle, evidence, contentPlan: contentPlan(evidence, input.settings), settings: input.settings, notes: input.notes };
  const instructions = `${JOB_ANALYSIS_INSTRUCTIONS}\nAnalyze the supplied raw job description first, then use that analysis to write the tailored resume. Return jobAnalysis and selection in the specified schema in ONE response. Text-matching scores are relevance hints, not verified job requirements.\n${RESUME_GENERATION_INSTRUCTIONS}`;
  let revision: Record<string, unknown> = {};
  // Two calls total: the second repairs structure OR coverage, never an unbounded loop.
  for (let attempt = 0; attempt < 2; attempt++) {
    let output;
    try {
      output = await requestStructured(tailoredContentSchema, instructions, { ...data, ...revision }, signal, attempt ? "revise-resume" : "generate-resume");
    } catch (error) {
      if (attempt === 0 && error instanceof AiOutputValidationError) {
        revision = { previousInvalidDraft: error.responseText, schemaIssues: error.issues, revisionRequirements: ["Correct the schema errors while preserving supported facts. Follow contentPlan.outputLimits. Do not invent, truncate strings blindly, or drop evidence to hide errors."] };
        continue;
      }
      throw error;
    }
    const resume = assembleResume({ ...input, jobAnalysis: output.jobAnalysis }, evidence, output.selection);
    const issues = selectionQualityIssues(evidence, input.settings, output.selection);
    if (!issues.length) return resume;
    revision = { previousDraft: output, revisionRequirements: issues };
  }
  throw new ApiError(422, "INSUFFICIENT_TAILORING", "The draft omitted too much useful profile information or repeated generic content, so it was not saved. Try generating again. Your approved profile is preserved.");
}
