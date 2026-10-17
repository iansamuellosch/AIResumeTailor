import { z } from "zod";

const label = z.string().trim().max(500, "Use 500 characters or fewer.");
const list = z.array(label.min(1)).max(100);
export const jobAnalysisSchema = z.object({
  jobTitle: label, company: label.optional(), seniority: label.optional(),
  requiredSkills: list, preferredSkills: list, responsibilities: list,
  qualifications: list, keywords: list,
});
export const analyzeJobRequestSchema = z.object({
  jobDescription: z.string().trim().min(20, "Paste the job description (at least 20 characters).").max(30000, "Keep the job description to 30,000 characters or fewer."),
  company: label.optional(), jobTitle: label.optional(),
});
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;
