import type { ResumeSelection, ResumeSettings } from "@/schemas/resume";
import type { SelectedEvidence } from "./evidence";

const normalized = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function contentPlan(evidence: SelectedEvidence, settings: ResumeSettings) {
  const entries = [...evidence.experience, ...evidence.projects];
  const matchingEntries = entries.filter((entry) => entry.relevanceScore > 0);
  // Atomic technology names alone are useful skills, not a reason to manufacture bullets.
  const substantiveFacts = (matchingEntries.length ? matchingEntries : entries).reduce((sum, entry) => sum + new Set(entry.facts.filter((fact) => fact.text.trim().split(/\s+/).length >= 4).map((fact) => normalized(fact.text))).size, 0);
  const lengthCap = settings.targetLength === "one-page" ? 10 : settings.targetLength === "two-pages" ? 20 : 16;
  const cap = matchingEntries.length ? lengthCap : Math.min(4, lengthCap);
  const targetBullets = Math.min(substantiveFacts, cap);
  return {
    targetBullets,
    minimumBullets: matchingEntries.length && substantiveFacts >= 6 ? Math.ceil(targetBullets * 0.6) : 0,
    minimumPrioritySkills: Math.min(4, evidence.prioritySkillIds.length),
    retainEducation: evidence.education.length > 0,
    lengthGuidance: settings.targetLength === "one-page" ? "Aim for a substantial one-page resume through concise writing." : settings.targetLength === "two-pages" ? "Use up to two pages of substantive, supported evidence." : "Use the space the supported evidence needs, usually one or two pages. Automatic does not mean shortest possible.",
  };
}

/** Coverage checks complement factual validation; they never authorize invented filler. */
export function selectionQualityIssues(evidence: SelectedEvidence, settings: ResumeSettings, selection: ResumeSelection): string[] {
  const plan = contentPlan(evidence, settings);
  const bullets = [...selection.experience, ...selection.projects].flatMap((entry) => entry.bullets);
  const distinct = new Set(bullets.map((bullet) => normalized(bullet.text)));
  const usedFacts = new Set(bullets.flatMap((bullet) => bullet.evidenceIds));
  const issues: string[] = [];
  if (distinct.size < plan.minimumBullets) issues.push(`The draft has only ${distinct.size} distinct bullets despite enough source material for at least ${plan.minimumBullets}. Restore substantive relevant facts instead of padding sentences.`);
  if (distinct.size !== bullets.length) issues.push("Remove duplicated bullets and use distinct supporting facts.");
  if (usedFacts.size < plan.minimumBullets) issues.push(`The bullets cover only ${usedFacts.size} source facts. Use more of the supplied distinct evidence rather than paraphrasing the same fact repeatedly.`);
  if (evidence.experience.length && !selection.experience.length) issues.push("Retain supported professional experience rather than omitting the entire employment section.");
  if (plan.retainEducation && !selection.educationIds.length) issues.push("Retain at least the primary education entry as professional background.");
  if (selection.skillIds.filter((id) => evidence.prioritySkillIds.includes(id)).length < plan.minimumPrioritySkills) issues.push(`Retain at least ${plan.minimumPrioritySkills} of the supplied job-relevant skill IDs.`);
  if (evidence.professionalContext.summary.trim().split(/\s+/).length >= 25 && normalized(selection.summary) === normalized(evidence.professionalContext.summary)) issues.push("Write a fresh job-specific summary grounded in the supplied facts instead of copying the generic original summary.");
  return issues;
}
