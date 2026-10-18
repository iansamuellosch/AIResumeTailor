import type { ProfessionalProfile } from "@/schemas/profile";
import type { GeneratedResume } from "@/schemas/resume";

export function TailoringOverview({ resume, profile }: { resume: GeneratedResume; profile?: ProfessionalProfile }) {
  if (!profile) return null;
  const sourceFacts = new Set([...profile.experience, ...profile.projects].flatMap((entry) => [...entry.responsibilities, ...entry.achievements, ...entry.technologies, ...("quantifiableResults" in entry ? entry.quantifiableResults : entry.description ? [{ id: entry.id, text: entry.description }] : [])]).map((fact) => fact.id));
  const usedFacts = new Set([...resume.experience, ...resume.projects].flatMap((entry) => entry.bullets.flatMap((bullet) => bullet.evidenceIds)).filter((id) => sourceFacts.has(id)));
  return <section className="space-y-3" aria-labelledby="tailoring-overview-title">
    <h2 id="tailoring-overview-title" className="font-semibold">Tailoring coverage</h2>
    <p className="text-sm">{resume.experience.length} of {profile.experience.length} employment entries · {resume.skills.length} of {profile.skills.length} skills · {usedFacts.size} of {sourceFacts.size} employment/project facts cited in bullets</p>
    <p className="text-sm text-muted-foreground">Selection counts show what was retained, not a quality or ATS score. Check that your strongest relevant accomplishments are included.</p>
    <details className="text-sm"><summary className="cursor-pointer font-medium">Compare the professional summary</summary>
      <div className="mt-3 space-y-3"><p><strong>Approved profile:</strong> {profile.summary || "No original summary."}</p><p><strong>This resume:</strong> {resume.summary || "No summary."}</p></div>
    </details>
  </section>;
}
