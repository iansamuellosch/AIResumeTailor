import { ApiError } from "@/lib/api/errors";
import { generatedResumeSchema, type GenerateResumeInput, type ResumeSelection } from "@/schemas/resume";
import type { SelectedEvidence } from "./evidence";

function reject(): never { throw new ApiError(422, "UNSUPPORTED_GENERATION", "Generated content contained unsupported evidence or metrics and was not saved. Try generating again."); }
/** Assembly checks references; the validation endpoint checks numeric and semantic claims. Semantic review is explicitly pending. */
export function assembleResume(input: GenerateResumeInput, evidence: SelectedEvidence, selection: ResumeSelection) {
  const seen = new Set<string>();
  function once(id: string) { if (seen.has(id)) reject(); seen.add(id); }
  function bullets(entry: ResumeSelection["experience"][number], allowed: { sourceId: string; facts: { id: string; text: string }[] }[]) {
    once(entry.sourceId);
    const source = allowed.find((item) => item.sourceId === entry.sourceId);
    if (!source) reject();
    return entry.bullets.map((bullet) => {
      for (const id of bullet.evidenceIds) if (!source.facts.some((fact) => fact.id === id)) reject();
      return { ...bullet, id: crypto.randomUUID() };
    });
  }
  function pick<T extends { id: string }>(ids: string[], allowed: T[]) {
    return ids.map((id) => { once(id); return allowed.find((entry) => entry.id === id) ?? reject(); });
  }
  const experience = selection.experience.map((entry) => {
    const selectedBullets = bullets(entry, evidence.experience);
    const source = input.profile.experience.find((item) => item.id === entry.sourceId) ?? reject();
    return { sourceId: source.id, employer: source.employer, jobTitle: source.jobTitle, location: source.location,
      startDate: source.startDate, endDate: source.endDate, currentlyEmployed: source.currentlyEmployed, bullets: selectedBullets };
  });
  const projects = selection.projects.map((entry) => {
    const selectedBullets = bullets(entry, evidence.projects);
    const source = input.profile.projects.find((item) => item.id === entry.sourceId) ?? reject();
    return { sourceId: source.id, name: source.name, role: source.role, description: source.description,
      projectUrl: source.projectUrl, repositoryUrl: source.repositoryUrl, startDate: source.startDate, endDate: source.endDate, bullets: selectedBullets };
  });
  const skills = pick(selection.skillIds, evidence.skills);
  const education = pick(selection.educationIds, evidence.education);
  const certifications = pick(selection.certificationIds, evidence.certifications);
  if (!(experience.length || projects.length || skills.length || education.length || certifications.length)) throw new ApiError(422, "NO_RESUME_CONTENT", "No supported resume content was selected. Add relevant facts to your profile or try again.");
  const now = new Date().toISOString();
  return generatedResumeSchema.parse({
    id: crypto.randomUUID(), profileId: input.profile.id, profileVersion: input.profile.version,
    jobAnalysis: input.jobAnalysis, settings: input.settings, jobUrl: input.jobUrl, notes: input.notes,
    contact: input.profile.personalInfo, headline: selection.headline, summary: selection.summary,
    experience, projects, skills, education, certifications,
    validation: { status: "pending-semantic-review", issues: [{ id: crypto.randomUUID(), severity: "warning", fieldPath: "", message: "Evidence references were checked. Semantic factual validation is pending; review all wording against your saved profile. An evidence ID does not prove a claim.", evidenceIds: [] }] },
    createdAt: now, updatedAt: now,
  });
}
