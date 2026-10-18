import { z } from "zod";

// Keep the existing ID so saved resumes continue to use Modern.
export const resumeTemplateSchema = z.enum(["modern-professional", "classic", "compact"]);
export type ResumeTemplate = z.infer<typeof resumeTemplateSchema>;
