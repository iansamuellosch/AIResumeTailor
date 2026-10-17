import { skillCategoryOptions } from "@/schemas/skill-categories";
import type { ProfessionalProfile } from "@/schemas/profile";

export type CollectionName = "experience" | "education" | "skills" | "projects" | "certifications" | "awards" | "publications" | "volunteerExperience" | "languages" | "memberships" | "additionalAccomplishments" | "personalInfo.additionalWebsites";
export type EntryFor<K extends CollectionName> = K extends "personalInfo.additionalWebsites" ? ProfessionalProfile["personalInfo"]["additionalWebsites"][number] : K extends keyof ProfessionalProfile ? ProfessionalProfile[K] extends (infer Entry)[] ? Entry : never : never;
export interface FieldDefinition {
  key: string;
  label: string;
  kind?: "textarea" | "month" | "email" | "url" | "select" | "checkbox" | "search-select" | "skill-experience";
  optional?: boolean;
  hint?: string;
  options?: { value: string; label: string }[];
}
export interface FactDefinition { key: string; label: string; singular: string }
export interface CollectionDefinition {
  name: CollectionName;
  title: string;
  singular: string;
  fields: FieldDefinition[];
  facts: FactDefinition[];
  create: () => EntryFor<CollectionName>;
}
function defineCollection<K extends CollectionName>(definition: Omit<CollectionDefinition, "name" | "fields" | "facts" | "create"> & {
  name: K;
  fields: (Omit<FieldDefinition, "key"> & { key: Extract<keyof EntryFor<K>, string> })[];
  facts?: (Omit<FactDefinition, "key"> & { key: Extract<keyof EntryFor<K>, string> })[];
  create: () => EntryFor<K>;
}): CollectionDefinition { return { ...definition, facts: definition.facts ?? [] }; }
const identity = () => ({ id: crypto.randomUUID() });
const dateFields = [
  { key: "startDate", label: "Start date", kind: "month", optional: true },
  { key: "endDate", label: "End date", kind: "month", optional: true },
] as const;
const responsibilityFacts = [
  { key: "responsibilities", label: "Responsibilities", singular: "responsibility" },
  { key: "achievements", label: "Achievements", singular: "achievement" },
] as const;

export const collections = {
  experience: defineCollection({
    name: "experience", title: "Work experience", singular: "employment",
    fields: [
      { key: "employer", label: "Employer" }, { key: "jobTitle", label: "Job title" },
      { key: "employmentType", label: "Employment type", kind: "select", options: [{ value: "", label: "Unspecified" }, ...["Full-time", "Part-time", "Contract", "Temporary", "Internship", "Apprenticeship", "Freelance", "Self-employed", "Volunteer", "Other"].map((value) => ({ value, label: value }))] },
      { key: "location", label: "Location" },
      { key: "workArrangement", label: "Work arrangement", kind: "select", options: [{ value: "unspecified", label: "Unspecified" }, { value: "onsite", label: "On-site" }, { value: "hybrid", label: "Hybrid" }, { value: "remote", label: "Remote" }] },
      { key: "currentlyEmployed", label: "Currently employed", kind: "checkbox" }, ...dateFields,
    ],
    facts: [...responsibilityFacts, { key: "technologies", label: "Technologies used", singular: "technology" }, { key: "quantifiableResults", label: "Quantifiable results", singular: "result" }],
    create: () => ({ ...identity(), employer: "", jobTitle: "", employmentType: "", location: "", workArrangement: "unspecified", currentlyEmployed: false, responsibilities: [], achievements: [], technologies: [], quantifiableResults: [] }),
  }),
  education: defineCollection({
    name: "education", title: "Education", singular: "education",
    fields: [{ key: "institution", label: "Institution" }, { key: "degree", label: "Degree" }, { key: "fieldOfStudy", label: "Field of study" }, dateFields[0], { key: "graduationDate", label: "Graduation date", kind: "month", optional: true }, { key: "gpa", label: "GPA", optional: true }],
    facts: [{ key: "honors", label: "Honors", singular: "honor" }, { key: "relevantCoursework", label: "Relevant coursework", singular: "course" }],
    create: () => ({ ...identity(), institution: "", degree: "", fieldOfStudy: "", honors: [], relevantCoursework: [] }),
  }),
  skills: defineCollection({
    name: "skills", title: "Skills", singular: "skill",
    fields: [{ key: "name", label: "Skill name" }, { key: "category", label: "Category", kind: "search-select", options: [...skillCategoryOptions] },
      { key: "supportingContext", label: "Experience", kind: "skill-experience", optional: true }],
    create: () => ({ ...identity(), name: "", category: "other" }),
  }),
  projects: defineCollection({
    name: "projects", title: "Projects", singular: "project",
    fields: [{ key: "name", label: "Project name" }, { key: "description", label: "Description", kind: "textarea" }, { key: "role", label: "Role" }, { key: "projectUrl", label: "Project URL", kind: "url", optional: true }, { key: "repositoryUrl", label: "Repository URL", kind: "url", optional: true }, ...dateFields],
    facts: [{ key: "technologies", label: "Technologies", singular: "technology" }, ...responsibilityFacts],
    create: () => ({ ...identity(), name: "", description: "", role: "", technologies: [], responsibilities: [], achievements: [] }),
  }),
  certifications: defineCollection({
    name: "certifications", title: "Certifications", singular: "certification",
    fields: [{ key: "name", label: "Certification name" }, { key: "issuingOrganization", label: "Issuing organization" }, { key: "issueDate", label: "Issue date", kind: "month", optional: true }, { key: "expirationDate", label: "Expiration date", kind: "month", optional: true }, { key: "credentialUrl", label: "Credential URL", kind: "url", optional: true }],
    create: () => ({ ...identity(), name: "", issuingOrganization: "" }),
  }),
  awards: defineCollection({
    name: "awards", title: "Awards", singular: "award",
    fields: [{ key: "name", label: "Award name" }, { key: "issuer", label: "Issuer" }, { key: "date", label: "Date", kind: "month", optional: true }, { key: "description", label: "Description", kind: "textarea" }],
    create: () => ({ ...identity(), name: "", issuer: "", description: "" }),
  }),
  publications: defineCollection({
    name: "publications", title: "Publications", singular: "publication",
    fields: [{ key: "title", label: "Publication title" }, { key: "publisher", label: "Publisher" }, { key: "date", label: "Publication date", kind: "month", optional: true }, { key: "url", label: "Publication URL", kind: "url", optional: true }, { key: "description", label: "Description", kind: "textarea" }],
    create: () => ({ ...identity(), title: "", publisher: "", description: "" }),
  }),
  volunteerExperience: defineCollection({
    name: "volunteerExperience", title: "Volunteer experience", singular: "volunteer entry",
    fields: [{ key: "organization", label: "Organization" }, { key: "role", label: "Volunteer role" }, ...dateFields],
    facts: [...responsibilityFacts],
    create: () => ({ ...identity(), organization: "", role: "", responsibilities: [], achievements: [] }),
  }),
  languages: defineCollection({
    name: "languages", title: "Languages", singular: "language",
    fields: [{ key: "name", label: "Language name" }, { key: "proficiency", label: "Language proficiency", optional: true }],
    create: () => ({ ...identity(), name: "" }),
  }),
  memberships: defineCollection({
    name: "memberships", title: "Professional memberships", singular: "membership",
    fields: [{ key: "organization", label: "Membership organization" }, { key: "role", label: "Membership role" }, ...dateFields],
    create: () => ({ ...identity(), organization: "", role: "" }),
  }),
  additionalAccomplishments: defineCollection({
    name: "additionalAccomplishments", title: "Additional accomplishments", singular: "accomplishment",
    fields: [{ key: "text", label: "Accomplishment", kind: "textarea" }],
    create: () => ({ ...identity(), text: "" }),
  }),
  websites: defineCollection({
    name: "personalInfo.additionalWebsites", title: "Additional websites", singular: "website",
    fields: [{ key: "label", label: "Website label" }, { key: "url", label: "Website URL", kind: "url", optional: true }],
    create: () => ({ ...identity(), label: "", url: "" }),
  }),
};

export const personalFields: FieldDefinition[] = [
  { key: "fullName", label: "Full name" }, { key: "email", label: "Email", kind: "email" }, { key: "phone", label: "Phone" },
  { key: "city", label: "City" }, { key: "region", label: "State or region" }, { key: "country", label: "Country" },
  { key: "linkedInUrl", label: "LinkedIn URL", kind: "url", optional: true }, { key: "portfolioUrl", label: "Portfolio URL", kind: "url", optional: true }, { key: "githubUrl", label: "GitHub URL", kind: "url", optional: true },
];
export const editorSections = [
  { id: "personal", title: "Personal information" }, { id: "summary", title: "Professional summary" },
  ...(["experience", "education", "skills", "projects", "certifications"] as const).map((id) => ({ id, title: collections[id].title })),
  { id: "additional", title: "Additional information" },
];
export type EditorSection = (typeof editorSections)[number]["id"];
export function sectionForPath(path: string): string {
  if (path.startsWith("personalInfo")) return "personal";
  if (["headline", "summary", "careerObjective"].includes(path)) return "summary";
  if (["experience", "education", "skills", "projects", "certifications"].includes(path.split(".")[0])) return path.split(".")[0];
  return "additional";
}
