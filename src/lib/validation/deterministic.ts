import type { ProfessionalProfile } from "@/schemas/profile";
import type { GeneratedResume, ValidationIssue } from "@/schemas/resume";

export interface Claim { fieldPath: string; text: string; evidence: { id: string; text: string }[]; context?: { section: "experience" | "projects"; name: string; role: string } }
export const numericTokens = (text: string) => text.match(/[-+]?\d+(?:[.,]\d+)*(?:\s*%)?/g)?.map((part) => part.replace(/\s/g, "")) ?? [];
function factText(value: unknown): string {
  if (Array.isArray(value)) return value.map(factText).join(" ");
  if (value && typeof value === "object") return Object.entries(value).filter(([key]) => key !== "id" && !/Url$/.test(key)).map(([, item]) => factText(item)).join(" ");
  return typeof value === "string" ? value : "";
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function inspectResume(profile: ProfessionalProfile, resume: GeneratedResume): { issues: ValidationIssue[]; claims: Claim[] } {
  const issues: ValidationIssue[] = []; const claims: Claim[] = []; const ids = new Set<string>();
  function issue(fieldPath: string, message: string, evidenceIds: string[] = []) { issues.push({ id: crypto.randomUUID(), severity: "error", fieldPath, message, evidenceIds }); }
  function unique(id: string, path: string) { if (ids.has(id)) issue(path, "Duplicate resume identifier."); ids.add(id); }
  function exact(value: unknown, source: unknown, path: string) { if (!equal(value, source)) issue(path, "This value does not match the saved source profile. Update your profile and select Save & Continue to change professional facts."); }
  function claim(fieldPath: string, text: string, evidence: Claim["evidence"], context?: Claim["context"]) {
    if (!text) return;
    const allowedNumbers = new Set(numericTokens(evidence.map((fact) => fact.text).join(" ")));
    if (numericTokens(text).some((number) => !allowedNumbers.has(number))) issue(fieldPath, "This text contains a number not supported by its evidence.", evidence.map((fact) => fact.id));
    claims.push({ fieldPath, text, evidence, context });
  }
  if (profile.status !== "verified" || profile.id !== resume.profileId || profile.version !== resume.profileVersion) issue("profileVersion", "The saved source profile does not match this resume's profile ID and version.");
  exact(resume.contact, profile.personalInfo, "contact");
  // Free-form summaries may draw on verified professional facts, never contact details or the job requirements.
  const summaryEvidence = [
    { id: `${profile.id}:headline`, text: profile.headline }, { id: `${profile.id}:summary`, text: profile.summary },
    ...profile.experience.map((entry) => ({ id: entry.id, text: factText({ employer: entry.employer, jobTitle: entry.jobTitle, responsibilities: entry.responsibilities, achievements: entry.achievements, technologies: entry.technologies, quantifiableResults: entry.quantifiableResults }) })),
    ...profile.projects.map((entry) => ({ id: entry.id, text: factText({ name: entry.name, role: entry.role, description: entry.description, responsibilities: entry.responsibilities, achievements: entry.achievements, technologies: entry.technologies }) })),
    ...profile.skills.map((entry) => ({ id: entry.id, text: `${entry.name} ${entry.proficiency ?? ""} ${entry.supportingContext ?? ""}` })),
    ...profile.education.map((entry) => ({ id: entry.id, text: factText(entry) })),
    ...profile.certifications.map((entry) => ({ id: entry.id, text: factText(entry) })),
  ].filter((fact) => fact.text);
  for (const key of ["headline", "summary"] as const) if (resume[key] !== profile[key]) claim(key, resume[key], summaryEvidence);
  for (const section of ["experience", "projects"] as const) resume[section].forEach((entry, i) => {
    const path = `${section}.${i}`; unique(entry.sourceId, `${path}.sourceId`);
    const source = profile[section].find((item) => item.id === entry.sourceId);
    if (!source) { issue(`${path}.sourceId`, "This entry is not present in the saved source section."); return; }
    const keys = section === "experience" ? ["employer", "jobTitle", "location", "startDate", "endDate", "currentlyEmployed"] : ["name", "role", "projectUrl", "repositoryUrl", "startDate", "endDate"];
    for (const key of keys) exact((entry as unknown as Record<string, unknown>)[key], (source as unknown as Record<string, unknown>)[key], `${path}.${key}`);
    const context: Claim["context"] = { section, name: "employer" in source ? source.employer : source.name, role: "jobTitle" in source ? source.jobTitle : source.role };
    const facts = [...source.responsibilities, ...source.achievements, ...source.technologies, ...("quantifiableResults" in source ? source.quantifiableResults : [{ id: source.id, text: source.description }])];
    if (section === "projects" && "description" in entry && "description" in source && entry.description !== source.description) claim(`${path}.description`, entry.description, facts, context);
    entry.bullets.forEach((bullet, j) => {
      const bulletPath = `${path}.bullets.${j}.text`; unique(bullet.id, `${path}.bullets.${j}.id`);
      const evidence = bullet.evidenceIds.map((id) => facts.find((fact) => fact.id === id));
      if (!evidence.length || evidence.some((fact) => !fact)) { issue(bulletPath, "Bullet evidence is missing or belongs to another entry.", bullet.evidenceIds); return; }
      claim(bulletPath, bullet.text, evidence.filter((fact): fact is NonNullable<typeof fact> => !!fact), context);
    });
  });
  for (const section of ["skills", "education", "certifications"] as const) resume[section].forEach((entry, i) => {
    unique(entry.id, `${section}.${i}.id`);
    const source = profile[section].find((item) => item.id === entry.id);
    if (!source) issue(`${section}.${i}`, "This item is not present in the saved source profile.");
    else exact(entry, source, `${section}.${i}`);
  });
  return { issues, claims };
}
