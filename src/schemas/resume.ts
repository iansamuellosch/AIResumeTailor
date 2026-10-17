import { z } from "zod";
import { professionalProfileSchema, personalInfoSchema, educationSchema, certificationSchema, skillSchema } from "./profile";
import { analyzeJobRequestSchema, jobAnalysisSchema } from "./job";
const id = z.string().trim().min(1).max(128);
const text = z.string().trim().max(10000);
export const resumeSettingsSchema = z.object({
  template: z.literal("modern-professional"),
  targetLength: z.enum(["one-page", "two-pages", "automatic"]),
  emphasis: z.enum(["balanced", "technical", "experience", "projects"]),
  additionalInstructions: z.string().trim().max(2000),
});
export const defaultResumeSettings: ResumeSettings = { template: "modern-professional", targetLength: "automatic", emphasis: "balanced", additionalInstructions: "" };
export const dashboardInputSchema = analyzeJobRequestSchema.extend({
  jobUrl: z.union([z.literal(""), z.url().refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS URL")]),
  notes: z.string().trim().max(2000), settings: resumeSettingsSchema,
});
export const generateResumeRequestSchema = z.object({
  profile: professionalProfileSchema.refine((value) => value.status === "verified", "Approve your profile before generating a resume."),
  jobAnalysis: jobAnalysisSchema, settings: resumeSettingsSchema,
  notes: z.string().trim().max(2000).default(""),
  jobUrl: dashboardInputSchema.shape.jobUrl.default(""),
});
export const tailorResumeRequestSchema = generateResumeRequestSchema.omit({ jobAnalysis: true }).extend(analyzeJobRequestSchema.shape);
export const resumeWritingLimits = { bulletsPerEntry: 12, evidenceIdsPerBullet: 20, headlineCharacters: 160, summaryCharacters: 1200 } as const;
export const generatedBulletSchema = z.object({ text: text.min(1), evidenceIds: z.array(id).min(1).max(resumeWritingLimits.evidenceIdsPerBullet) });
const selectedEntrySchema = z.object({ sourceId: id, bullets: z.array(generatedBulletSchema).min(1).max(resumeWritingLimits.bulletsPerEntry) });
// Gemini chooses source IDs and wording; identity fields and metadata are copied by the server.
export const resumeSelectionSchema = z.object({
  experience: z.array(selectedEntrySchema).max(20), projects: z.array(selectedEntrySchema).max(12),
  skillIds: z.array(id).max(60), educationIds: z.array(id).max(20), certificationIds: z.array(id).max(30),
  headline: z.string().trim().max(resumeWritingLimits.headlineCharacters), summary: z.string().trim().max(resumeWritingLimits.summaryCharacters),
});
export const tailoredContentSchema = z.object({ jobAnalysis: jobAnalysisSchema, selection: resumeSelectionSchema });
const bullet = generatedBulletSchema.extend({ id });
export const resumeExperienceSchema = z.object({
  sourceId: id, employer: text, jobTitle: text, location: text,
  startDate: text.optional(), endDate: text.optional(), currentlyEmployed: z.boolean(), bullets: z.array(bullet),
});
export const resumeProjectSchema = z.object({
  sourceId: id, name: text, role: text, description: text, projectUrl: text.optional(), repositoryUrl: text.optional(),
  startDate: text.optional(), endDate: text.optional(), bullets: z.array(bullet),
});
export const resumeValidationSchema = z.object({
  status: z.enum(["pending-semantic-review", "passed", "needs-review", "failed"]),
  checkedAt: z.iso.datetime().optional(), correctionAttempted: z.boolean().optional(),
  issues: z.array(z.object({ id, severity: z.enum(["error", "warning"]), fieldPath: text, message: text, evidenceIds: z.array(id) })),
}).superRefine((result, ctx) => {
  if (result.status !== "pending-semantic-review" && !result.checkedAt) ctx.addIssue({ code: "custom", path: ["checkedAt"], message: "A completed review needs a timestamp" });
  const errors = result.issues.some((issue) => issue.severity === "error");
  if ((result.status === "passed" && result.issues.length) || (result.status === "needs-review" && (!result.issues.length || errors)) || (result.status === "failed" && !errors)) ctx.addIssue({ code: "custom", path: ["status"], message: "Review status does not match its issues" });
});
export const generatedResumeSchema = z.object({
  id, profileId: id, profileVersion: z.number().int().positive(),
  jobAnalysis: jobAnalysisSchema, settings: resumeSettingsSchema, jobUrl: dashboardInputSchema.shape.jobUrl, notes: text,
  contact: personalInfoSchema, headline: text, summary: text,
  experience: z.array(resumeExperienceSchema), projects: z.array(resumeProjectSchema),
  education: z.array(educationSchema), skills: z.array(skillSchema), certifications: z.array(certificationSchema),
  validation: resumeValidationSchema, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).refine((value) => value.updatedAt >= value.createdAt, { message: "Update cannot precede creation", path: ["updatedAt"] });
export type ResumeSettings = z.infer<typeof resumeSettingsSchema>;
export type GeneratedResume = z.infer<typeof generatedResumeSchema>;
export type ResumeSelection = z.infer<typeof resumeSelectionSchema>;
export type GenerateResumeInput = z.infer<typeof generateResumeRequestSchema>;
export type TailorResumeInput = z.infer<typeof tailorResumeRequestSchema>;
export type DashboardInput = z.infer<typeof dashboardInputSchema>;

export type ResumeValidationResult = z.infer<typeof resumeValidationSchema>;
export type ValidationIssue = ResumeValidationResult["issues"][number];
