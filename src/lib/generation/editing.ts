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
export function pendingValidation(): GeneratedResume["validation"] {
  return { status: "pending-semantic-review", issues: [] };
}
