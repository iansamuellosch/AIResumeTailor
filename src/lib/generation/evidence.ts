import type { ProfessionalProfile } from "@/schemas/profile";
import type { JobAnalysis } from "@/schemas/job";
import type { ResumeSettings } from "@/schemas/resume";

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.\-]*/gu)?.filter((word) => word.length > 1) ?? []);
}
/** Stable relevance ordering. No embeddings or invented qualifications; ties retain profile order. */
export function selectEvidence(profile: ProfessionalProfile, job: JobAnalysis, settings: ResumeSettings) {
  const terms = tokens([job.jobTitle, ...job.requiredSkills, ...job.preferredSkills, ...job.keywords, ...job.responsibilities, ...job.qualifications].join(" "));
  function rank<T>(entries: T[], describe: (entry: T) => string, limit: number): T[] {
    return entries.map((entry, index) => ({ entry, index, score: [...tokens(describe(entry))].filter((word) => terms.has(word)).length }))
      .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map(({ entry }) => entry);
  }
  const factLimit = settings.targetLength === "one-page" ? 8 : 16;
  const experience = rank(profile.experience, (entry) => JSON.stringify(entry), settings.targetLength === "one-page" ? 4 : 8).map((entry) => ({
    sourceId: entry.id, employer: entry.employer, jobTitle: entry.jobTitle,
    facts: rank([...entry.responsibilities, ...entry.achievements, ...entry.technologies, ...entry.quantifiableResults], (fact) => fact.text, factLimit),
  })).filter((entry) => entry.facts.length);
  const projects = rank(profile.projects, (entry) => JSON.stringify(entry), settings.emphasis === "projects" ? 6 : 3).map((entry) => ({
    sourceId: entry.id, name: entry.name, role: entry.role,
    facts: rank([{ id: entry.id, text: entry.description }, ...entry.responsibilities, ...entry.achievements, ...entry.technologies].filter((fact) => fact.text), (fact) => fact.text, factLimit),
  })).filter((entry) => entry.facts.length);
  return {
    experience, projects,
    skills: rank(profile.skills, (skill) => `${skill.name} ${skill.supportingContext ?? ""}`, settings.emphasis === "technical" ? 60 : 40),
    education: profile.education.slice(0, 20), certifications: profile.certifications.slice(0, 30),
  };
}
export type SelectedEvidence = ReturnType<typeof selectEvidence>;
