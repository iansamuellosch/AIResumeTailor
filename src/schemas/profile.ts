import { z } from "zod";
import { skillCategorySchema } from "./skill-categories";

const id = z.string().trim().min(1).max(128);
const text = z.string().trim().max(10000);
const requiredText = text.min(1);
const optionalUrl = z.union([z.literal(""), z.url().refine((value) => /^https?:\/\//i.test(value), "Use an HTTP or HTTPS URL")]).optional();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
const timestamp = z.iso.datetime();
export const factSchema = z.object({ id, text: requiredText });
export const websiteSchema = z.object({ id, label: text, url: optionalUrl });
export const personalInfoSchema = z.object({
  fullName: text, email: z.union([z.literal(""), z.email()]), phone: text,
  city: text, region: text, country: text,
  linkedInUrl: optionalUrl, portfolioUrl: optionalUrl, githubUrl: optionalUrl,
  additionalWebsites: z.array(websiteSchema),
});

export const workExperienceSchema = z.object({
  id, employer: requiredText, jobTitle: requiredText, employmentType: text,
  location: text, workArrangement: z.enum(["onsite", "hybrid", "remote", "unspecified"]),
  startDate: month.optional(), endDate: month.optional(), currentlyEmployed: z.boolean(),
  responsibilities: z.array(factSchema), achievements: z.array(factSchema),
  technologies: z.array(factSchema), quantifiableResults: z.array(factSchema),
}).superRefine((entry, ctx) => {
  if (entry.currentlyEmployed && entry.endDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Current employment cannot have an end date" });
  if (entry.startDate && entry.endDate && entry.endDate < entry.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must follow start date" });
});
export const educationSchema = z.object({
  id, institution: requiredText, degree: text, fieldOfStudy: text,
  startDate: month.optional(), graduationDate: month.optional(), gpa: text.optional(),
  honors: z.array(factSchema), relevantCoursework: z.array(factSchema),
}).refine((entry) => !entry.startDate || !entry.graduationDate || entry.graduationDate >= entry.startDate, { path: ["graduationDate"], message: "Graduation must follow start date" });
export const skillSchema = z.object({
  id, name: requiredText,
  category: skillCategorySchema,
  proficiency: text.optional(), supportingContext: text.optional(),
});
export const projectSchema = z.object({
  id, name: requiredText, description: text, role: text, technologies: z.array(factSchema),
  projectUrl: optionalUrl, repositoryUrl: optionalUrl, startDate: month.optional(), endDate: month.optional(),
  responsibilities: z.array(factSchema), achievements: z.array(factSchema),
}).refine((entry) => !entry.startDate || !entry.endDate || entry.endDate >= entry.startDate, { path: ["endDate"], message: "End date must follow start date" });
export const certificationSchema = z.object({
  id, name: requiredText, issuingOrganization: text, issueDate: month.optional(), expirationDate: month.optional(), credentialUrl: optionalUrl,
}).refine((entry) => !entry.issueDate || !entry.expirationDate || entry.expirationDate >= entry.issueDate, { path: ["expirationDate"], message: "Expiration must follow issue date" });
export const awardSchema = z.object({ id, name: requiredText, issuer: text, date: month.optional(), description: text });
export const publicationSchema = z.object({ id, title: requiredText, publisher: text, date: month.optional(), url: optionalUrl, description: text });
export const volunteerExperienceSchema = z.object({ id, organization: requiredText, role: text, startDate: month.optional(), endDate: month.optional(), responsibilities: z.array(factSchema), achievements: z.array(factSchema) }).refine((entry) => !entry.startDate || !entry.endDate || entry.endDate >= entry.startDate, { path: ["endDate"], message: "End date must follow start date" });
export const languageSchema = z.object({ id, name: requiredText, proficiency: text.optional() });
export const membershipSchema = z.object({ id, organization: requiredText, role: text, startDate: month.optional(), endDate: month.optional() }).refine((entry) => !entry.startDate || !entry.endDate || entry.endDate >= entry.startDate, { path: ["endDate"], message: "End date must follow start date" });

const profileBaseSchema = z.object({
  id, version: z.number().int().positive(), status: z.enum(["draft", "verified"]),
  personalInfo: personalInfoSchema, headline: text, summary: text, careerObjective: text.optional(),
  experience: z.array(workExperienceSchema), education: z.array(educationSchema), skills: z.array(skillSchema),
  projects: z.array(projectSchema), certifications: z.array(certificationSchema), awards: z.array(awardSchema),
  publications: z.array(publicationSchema), volunteerExperience: z.array(volunteerExperienceSchema),
  languages: z.array(languageSchema), memberships: z.array(membershipSchema), additionalAccomplishments: z.array(factSchema),
  createdAt: timestamp, updatedAt: timestamp, verifiedAt: timestamp.optional(),
});

function checkProfileIntegrity(profile: z.infer<typeof profileBaseSchema>, ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  function checkIds(value: unknown, path: (string | number)[]) {
    if (Array.isArray(value)) { value.forEach((item, index) => checkIds(item, [...path, index])); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (key === "id" && typeof item === "string") {
        if (seen.has(item)) ctx.addIssue({ code: "custom", path: [...path, key], message: "IDs must be unique throughout the profile" });
        seen.add(item);
      } else checkIds(item, [...path, key]);
    }
  }
  checkIds(profile, []);
  if (profile.updatedAt < profile.createdAt) ctx.addIssue({ code: "custom", path: ["updatedAt"], message: "Update cannot precede creation" });
  if (profile.status === "draft" && profile.verifiedAt) ctx.addIssue({ code: "custom", path: ["verifiedAt"], message: "Drafts cannot be verified" });
  if (profile.status === "verified") {
    if (!profile.verifiedAt) ctx.addIssue({ code: "custom", path: ["verifiedAt"], message: "Verification timestamp is required" });
    if (!profile.personalInfo.fullName) ctx.addIssue({ code: "custom", path: ["personalInfo", "fullName"], message: "Name is required for verification" });
    if (profile.verifiedAt && (profile.verifiedAt < profile.createdAt || profile.verifiedAt > profile.updatedAt)) ctx.addIssue({ code: "custom", path: ["verifiedAt"], message: "Verification must fall between creation and last update" });
  }
}

export const professionalProfileSchema = profileBaseSchema.superRefine(checkProfileIntegrity);


// Editor drafts may contain unfinished or invalid field values. Strict schemas
// remain mandatory for AI extraction and explicit profile approval.
const draftText = z.string().max(10000);
const draftOptional = draftText.optional();
const draftFact = factSchema.extend({ text: draftText });
const draftDates = { startDate: draftOptional, endDate: draftOptional };
export const profileDraftSchema = profileBaseSchema.extend({
  status: profileBaseSchema.shape.status.refine((status) => status === "draft", "Editor data must stay a draft"),
  verifiedAt: profileBaseSchema.shape.verifiedAt.refine((value) => value === undefined, "Drafts cannot be verified"),
  personalInfo: personalInfoSchema.extend({
    email: draftText, linkedInUrl: draftOptional, portfolioUrl: draftOptional, githubUrl: draftOptional,
    additionalWebsites: z.array(websiteSchema.extend({ url: draftOptional })),
  }),
  experience: z.array(z.object(workExperienceSchema.shape).extend({
    employer: draftText, jobTitle: draftText, ...draftDates,
    responsibilities: z.array(draftFact), achievements: z.array(draftFact),
    technologies: z.array(draftFact), quantifiableResults: z.array(draftFact),
  })),
  education: z.array(z.object(educationSchema.shape).extend({
    institution: draftText, startDate: draftOptional, graduationDate: draftOptional,
    honors: z.array(draftFact), relevantCoursework: z.array(draftFact),
  })),
  skills: z.array(skillSchema.extend({ name: draftText })),
  projects: z.array(z.object(projectSchema.shape).extend({
    name: draftText, ...draftDates, projectUrl: draftOptional, repositoryUrl: draftOptional,
    technologies: z.array(draftFact), responsibilities: z.array(draftFact), achievements: z.array(draftFact),
  })),
  certifications: z.array(z.object(certificationSchema.shape).extend({ name: draftText, issueDate: draftOptional, expirationDate: draftOptional, credentialUrl: draftOptional })),
  awards: z.array(awardSchema.extend({ name: draftText, date: draftOptional })),
  publications: z.array(publicationSchema.extend({ title: draftText, date: draftOptional, url: draftOptional })),
  volunteerExperience: z.array(z.object(volunteerExperienceSchema.shape).extend({ organization: draftText, ...draftDates, responsibilities: z.array(draftFact), achievements: z.array(draftFact) })),
  languages: z.array(languageSchema.extend({ name: draftText })),
  memberships: z.array(z.object(membershipSchema.shape).extend({ organization: draftText, ...draftDates })),
  additionalAccomplishments: z.array(draftFact),
}).superRefine(checkProfileIntegrity);

export type ProfessionalProfile = z.infer<typeof professionalProfileSchema>;
/** IDs are created once here (or when adding an entry), never during validation. */
export function createEmptyProfile(): ProfessionalProfile {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), version: 1, status: "draft",
    personalInfo: { fullName: "", email: "", phone: "", city: "", region: "", country: "", additionalWebsites: [] },
    headline: "", summary: "", experience: [], education: [], skills: [], projects: [], certifications: [],
    awards: [], publications: [], volunteerExperience: [], languages: [], memberships: [], additionalAccomplishments: [],
    createdAt: now, updatedAt: now,
  };
}
