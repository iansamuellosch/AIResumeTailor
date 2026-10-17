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

const extractedDateSections = {
  experience: { label: "Employment", context: ["jobTitle", "employer"], dates: ["startDate", "endDate"] },
  education: { label: "Education", context: ["degree", "institution"], dates: ["startDate", "graduationDate"] },
  projects: { label: "Project", context: ["name"], dates: ["startDate", "endDate"] },
  certifications: { label: "Certification", context: ["name", "issuingOrganization"], dates: ["issueDate", "expirationDate"] },
  awards: { label: "Award", context: ["name", "issuer"], dates: ["date"] },
  publications: { label: "Publication", context: ["title", "publisher"], dates: ["date"] },
  volunteerExperience: { label: "Volunteer experience", context: ["role", "organization"], dates: ["startDate", "endDate"] },
  memberships: { label: "Membership", context: ["organization", "role"], dates: ["startDate", "endDate"] },
};
const dateLabels: Record<string, string> = { startDate: "start year", endDate: "end year", graduationDate: "graduation year", issueDate: "issue year", expirationDate: "expiration year", date: "year" };

/** Keep year-only extraction as reviewable facts; never guess a missing month. */
function normalizeExtractedDates(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const result = { ...input } as Record<string, unknown>;
  const notes = Array.isArray(result.additionalAccomplishments) ? [...result.additionalAccomplishments] : undefined;
  for (const [section, config] of Object.entries(extractedDateSections)) {
    const entries = result[section];
    if (!Array.isArray(entries)) continue;
    result[section] = entries.map((entry: unknown) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const normalized = { ...entry } as Record<string, unknown>;
      for (const field of config.dates) {
        const raw = normalized[field];
        if (raw === null || (typeof raw === "string" && !raw.trim())) { delete normalized[field]; continue; }
        if (typeof raw !== "string" || !/^\d{4}$/.test(raw.trim()) || !notes) continue;
        const context = config.context.map((key) => normalized[key]).filter((value): value is string => typeof value === "string" && Boolean(value.trim())).join(" · ");
        const text = `${config.label}${context ? ` (${context})` : ""} — ${dateLabels[field]}: ${raw.trim()}`;
        if (!notes.some((note) => note && typeof note === "object" && "text" in note && note.text === text)) notes.push({ id: crypto.randomUUID(), text });
        delete normalized[field];
      }
      return normalized;
    });
  }
  if (notes) result.additionalAccomplishments = notes;
  return result;
}

export function extractedDataToDraft(input: unknown) {
  const content = extractedProfileSchema.parse(assignFactIds(normalizeExtractedDates(input)));
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
