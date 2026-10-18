import { z } from "zod";
import { professionalProfileSchema } from "./profile";
import { generatedResumeSchema } from "./resume";
export const validateResumeRequestSchema = z.object({
  profile: professionalProfileSchema.refine((profile) => profile.status === "verified", "A saved source profile is required."),
  resume: generatedResumeSchema,
  correct: z.boolean().default(false),
  reviewPermit: z.string().max(4096).optional(),
});
export const semanticReviewSchema = z.object({
  claims: z.array(z.object({
    fieldPath: z.string().min(1).max(500),
    outcome: z.enum(["supported", "unsupported", "uncertain"]),
    message: z.string().trim().max(1000),
  })).max(500),
});
export const correctionsSchema = z.object({ replacements: z.array(z.object({ fieldPath: z.string().min(1).max(500), text: z.string().trim().min(1).max(10000) })).max(500) });
export type ValidateResumeInput = z.infer<typeof validateResumeRequestSchema>;
