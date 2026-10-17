import { z } from "zod";
import { professionalProfileSchema, createEmptyProfile } from "./profile";
import { MAX_TEXT_CHARACTERS } from "@/lib/parsing/limits";

export const parseResumeRequestSchema = z.object({
  text: z.string().trim().min(20).max(MAX_TEXT_CHARACTERS),
}).strict();

// Reuse the profile field schemas without accepting lifecycle metadata from AI.
export const extractedProfileSchema = z.object(professionalProfileSchema.shape).omit({
  id: true, version: true, status: true, createdAt: true, updatedAt: true, verifiedAt: true,
});

function assignFactIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(assignFactIds);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "id" ? crypto.randomUUID() : assignFactIds(item)]));
}

export function extractedDataToDraft(input: unknown) {
  const content = extractedProfileSchema.parse(assignFactIds(input));
  const draft = professionalProfileSchema.parse({ ...createEmptyProfile(), ...content });
  if (!draft.personalInfo.fullName && !draft.summary && !draft.experience.length && !draft.education.length && !draft.skills.length && !draft.projects.length && !draft.certifications.length && !draft.volunteerExperience.length && !draft.additionalAccomplishments.length) {
    throw new Error("No professional information was extracted");
  }
  return draft;
}

export const parseResumeResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ profile: professionalProfileSchema.refine((profile) => profile.status === "draft", "AI results must be drafts") }),
});
export const apiErrorSchema = z.object({ success: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) });
