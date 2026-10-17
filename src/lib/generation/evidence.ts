import type { ProfessionalProfile } from "@/schemas/profile";
import type { JobAnalysis } from "@/schemas/job";
import type { ResumeSettings } from "@/schemas/resume";

function tokens(value: string): Set<string> {
  const stopwords = new Set(["and", "the", "with", "for", "from", "that", "this", "are", "our", "you", "your", "will", "have", "has", "into", "using", "work", "working", "experience", "required", "preferred", "ability", "skills", "of", "to", "in", "on", "at", "as", "an", "be", "is", "or"]);
  return new Set(value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.\-]*/gu)?.filter((word) => word.length > 1 && !stopwords.has(word)) ?? []);
}
/** Stable relevance ordering. No embeddings or invented qualifications; ties retain profile order. */
export function selectEvidence(profile: ProfessionalProfile, job: JobAnalysis, settings: ResumeSettings) {
  const terms = new Map<string, number>();
  for (const [values, weight] of [[job.requiredSkills, 4], [job.preferredSkills, 2], [job.keywords, 3], [[job.jobTitle], 2], [[...job.responsibilities, ...job.qualifications], 1]] as const) {
    for (const term of tokens(values.join(" "))) terms.set(term, Math.max(terms.get(term) ?? 0, weight));
  }
  const score = (value: string) => [...tokens(value)].reduce((sum, word) => sum + (terms.get(word) ?? 0), 0);
  function rank<T>(entries: T[], describe: (entry: T) => string, limit: number): T[] {
    return entries.map((entry, index) => ({ entry, index, score: score(describe(entry)) }))
      .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map(({ entry }) => entry);
  }
  // Give the writer enough source material to choose well; length is a writing budget,
  // not an early deletion of most of the candidate's professional history.
  const factLimit = settings.targetLength === "one-page" ? 24 : 40;
  const experience = rank(profile.experience, (entry) => JSON.stringify(entry), 20).map((entry) => ({
    sourceId: entry.id, employer: entry.employer, jobTitle: entry.jobTitle, startDate: entry.startDate, endDate: entry.endDate, currentlyEmployed: entry.currentlyEmployed, relevanceScore: score(JSON.stringify(entry)),
    facts: rank([...entry.responsibilities, ...entry.achievements, ...entry.technologies, ...entry.quantifiableResults], (fact) => fact.text, factLimit),
  })).filter((entry) => entry.facts.length);
  const projects = rank(profile.projects, (entry) => JSON.stringify(entry), settings.emphasis === "projects" ? 12 : 8).map((entry) => ({
    sourceId: entry.id, name: entry.name, role: entry.role, startDate: entry.startDate, endDate: entry.endDate, relevanceScore: score(JSON.stringify(entry)),
    facts: rank([{ id: entry.id, text: entry.description }, ...entry.responsibilities, ...entry.achievements, ...entry.technologies].filter((fact) => fact.text), (fact) => fact.text, factLimit),
  })).filter((entry) => entry.facts.length);
  return {
    professionalContext: { headline: profile.headline, summary: profile.summary },
    experience, projects,
    skills: rank(profile.skills, (skill) => `${skill.name} ${skill.supportingContext ?? ""}`, 60),
    prioritySkillIds: rank(profile.skills.filter((skill) => score(`${skill.name} ${skill.supportingContext ?? ""}`) > 0), (skill) => skill.name, 12).map((skill) => skill.id),
    education: profile.education.slice(0, 20), certifications: profile.certifications.slice(0, 30),
  };
}
export type SelectedEvidence = ReturnType<typeof selectEvidence>;
