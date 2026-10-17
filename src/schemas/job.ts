import { z } from "zod";

const label = z.string().trim().max(500);
const list = z.array(label.min(1)).max(100);
export const jobAnalysisSchema = z.object({
  jobTitle: label, company: label.optional(), seniority: label.optional(),
  requiredSkills: list, preferredSkills: list, responsibilities: list,
  qualifications: list, keywords: list,
});
export const analyzeJobRequestSchema = z.object({
  jobDescription: z.string().trim().min(20, "Provide at least 20 characters of job description.").max(30000),
  company: label.optional(), jobTitle: label.optional(),
});
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;
