import type { ProfessionalProfile } from "@/schemas/profile";
import type { GeneratedResume } from "@/schemas/resume";
export function EvidencePanel({ resume, profile }: { resume: GeneratedResume; profile?: ProfessionalProfile }) {
  return <details className="rounded-xl border bg-card p-5"><summary className="cursor-pointer font-semibold">Supporting evidence</summary>
    {!profile ? <p className="mt-3 text-sm text-muted-foreground">This older resume has no saved evidence snapshot. Factual review can use the current approved profile only if its ID and version still match.</p> : <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">Approved profile version {profile.version}, captured when this resume was generated. Check whether each fact supports the full wording of its bullet.</p>
      {(["experience", "projects"] as const).flatMap((section) => resume[section].map((entry) => {
        const source = profile[section].find((item) => item.id === entry.sourceId);
        const facts = source ? [...source.responsibilities, ...source.achievements, ...source.technologies, ...("quantifiableResults" in source ? source.quantifiableResults : [{ id: source.id, text: source.description }])] : [];
        return <div key={entry.sourceId} className="space-y-3"><h3 className="text-sm font-semibold">{"employer" in entry ? entry.employer : entry.name}</h3>{entry.bullets.map((bullet) => <div key={bullet.id} className="border-l-2 pl-3 text-sm"><p>{bullet.text}</p><ul className="mt-1 list-disc pl-5 text-muted-foreground">{bullet.evidenceIds.map((id, index) => <li key={`${id}-${index}`}>{facts.find((fact) => fact.id === id)?.text || "Supporting fact unavailable in this source entry."}</li>)}</ul></div>)}</div>;
      }))}
    </div>}
  </details>;
}
