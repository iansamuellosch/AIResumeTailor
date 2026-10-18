import type { ProfessionalProfile } from "@/schemas/profile";
import type { GeneratedResume } from "@/schemas/resume";
export function EvidencePanel({ resume, profile }: { resume: GeneratedResume; profile?: ProfessionalProfile }) {
  return <section aria-labelledby="resume-evidence-title" className="space-y-3 border-t pt-5"><h2 id="resume-evidence-title" className="font-semibold">Sources for each bullet</h2>
    {!profile ? <p className="mt-3 text-sm text-muted-foreground">This older resume has no saved profile snapshot to show its supporting evidence.</p> : <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">Saved profile version {profile.version}, captured when this resume was generated. Check whether each fact supports the full wording of its bullet.</p>
      {(["experience", "projects"] as const).flatMap((section) => resume[section].map((entry) => {
        const source = profile[section].find((item) => item.id === entry.sourceId);
        const facts = source ? [...source.responsibilities, ...source.achievements, ...source.technologies, ...("quantifiableResults" in source ? source.quantifiableResults : [{ id: source.id, text: source.description }])] : [];
        return <div key={entry.sourceId} className="space-y-3"><h3 className="text-sm font-semibold">{"employer" in entry ? entry.employer : entry.name}</h3>{entry.bullets.map((bullet) => <div key={bullet.id} className="border-l-2 pl-3 text-sm"><p>{bullet.text}</p><ul className="mt-1 list-disc pl-5 text-muted-foreground">{bullet.evidenceIds.map((id, index) => <li key={`${id}-${index}`}>{facts.find((fact) => fact.id === id)?.text || "Supporting fact unavailable in this source entry."}</li>)}</ul></div>)}</div>;
      }))}
    </div>}
  </section>;
}
