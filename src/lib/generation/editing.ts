import type { GeneratedResume } from "@/schemas/resume";

export interface EditableField { path: string; label: string; value: string; group: string; multiline?: boolean }
/** Explicit paths only: evidence IDs, source IDs and lifecycle/validation metadata are never editable. */
export function editableResumeFields(resume: GeneratedResume): EditableField[] {
  const fields: EditableField[] = [];
  function add(path: string, label: string, value: string | undefined, group: string, multiline = false) { fields.push({ path, label, value: value ?? "", group, multiline }); }
  for (const key of ["fullName", "email", "phone", "city", "region", "country", "linkedInUrl", "portfolioUrl", "githubUrl"] as const) add(`contact.${key}`, key.replace(/([A-Z])/g, " $1"), resume.contact[key], "Contact");
  resume.contact.additionalWebsites.forEach((site, i) => { add(`contact.additionalWebsites.${i}.label`, "Website label", site.label, "Contact"); add(`contact.additionalWebsites.${i}.url`, "Website URL", site.url, "Contact"); });
  add("headline", "Headline", resume.headline, "Summary"); add("summary", "Professional summary", resume.summary, "Summary", true);
  resume.experience.forEach((entry, i) => {
    const group = `Employment ${i + 1}`;
    for (const key of ["employer", "jobTitle", "location", "startDate", "endDate"] as const) add(`experience.${i}.${key}`, key.replace(/([A-Z])/g, " $1"), entry[key], group);
    entry.bullets.forEach((bullet, j) => add(`experience.${i}.bullets.${j}.text`, `Bullet ${j + 1}`, bullet.text, group, true));
  });
  resume.projects.forEach((entry, i) => {
    const group = `Project ${i + 1}`;
    for (const key of ["name", "role", "description", "projectUrl", "repositoryUrl", "startDate", "endDate"] as const) add(`projects.${i}.${key}`, key.replace(/([A-Z])/g, " $1"), entry[key], group, key === "description");
    entry.bullets.forEach((bullet, j) => add(`projects.${i}.bullets.${j}.text`, `Bullet ${j + 1}`, bullet.text, group, true));
  });
  resume.skills.forEach((entry, i) => add(`skills.${i}.name`, `Skill ${i + 1}`, entry.name, "Skills"));
  resume.education.forEach((entry, i) => {
    const group = `Education ${i + 1}`;
    for (const key of ["institution", "degree", "fieldOfStudy", "startDate", "graduationDate", "gpa"] as const) add(`education.${i}.${key}`, key.replace(/([A-Z])/g, " $1"), entry[key], group);
    for (const key of ["honors", "relevantCoursework"] as const) entry[key].forEach((fact, j) => add(`education.${i}.${key}.${j}.text`, `${key} ${j + 1}`, fact.text, group));
  });
  resume.certifications.forEach((entry, i) => {
    for (const key of ["name", "issuingOrganization", "issueDate", "expirationDate", "credentialUrl"] as const) add(`certifications.${i}.${key}`, key.replace(/([A-Z])/g, " $1"), entry[key], `Certification ${i + 1}`);
  });
  return fields;
}
export function replaceResumeText(resume: GeneratedResume, path: string, text: string): GeneratedResume {
  if (!editableResumeFields(resume).some((field) => field.path === path)) throw new Error("This resume field cannot be edited.");
  const result = structuredClone(resume);
  const keys = path.split(".");
  let target: Record<string, unknown> = result as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  const key = keys.at(-1)!;
  target[key] = text || (target[key] === undefined || /Date$|Url$/.test(key) ? undefined : "");
  return result;
}
export function manualEditValidation(): GeneratedResume["validation"] {
  return { status: "manually-edited", issues: [] };
}

/** Use editor labels rather than schema paths when explaining invalid edits. */
export function resumeEditError(resume: GeneratedResume, issues: readonly import("zod").z.core.$ZodIssue[]): string {
  const fields = editableResumeFields(resume);
  return issues.map((issue) => {
    const field = fields.find((entry) => entry.path === issue.path.join("."));
    if (!field) return "Some saved resume information is invalid. Reload the saved version and try again.";
    const instruction = issue.code === "too_small" ? "Add text before saving." : issue.code === "too_big" ? `Use ${Number(issue.maximum).toLocaleString("en-US")} characters or fewer.` : /Date$/.test(field.path) && issue.code === "invalid_format" ? "Enter a month and year, such as Apr 2023." : issue.code === "custom" ? issue.message : /url$/i.test(field.path) ? "Enter a complete link starting with https:// or http://." : /email$/i.test(field.path) ? "Enter a valid email address." : "Check this value before saving.";
    return `${field.group} · ${field.label}: ${instruction}`;
  }).join(" ");
}

/** Restoring the saved wording (including via undo) can retain its factual review. */
export function resumeTextHasChanges(current: GeneratedResume, saved: GeneratedResume): boolean {
  const previous = new Map(editableResumeFields(saved).map((field) => [field.path, field.value]));
  const fields = editableResumeFields(current);
  return fields.length !== previous.size || fields.some((field) => field.value !== previous.get(field.path));
}
