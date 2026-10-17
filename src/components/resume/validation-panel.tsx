import type { GeneratedResume } from "@/schemas/resume";
export function ValidationPanel({ resume }: { resume: GeneratedResume }) {
  const validation = resume.validation;
  const label = { "pending-semantic-review": "Changes need factual review", passed: "Factual checks completed", "needs-review": "Review validation warnings", failed: "Unsupported claims require correction" }[validation.status];
  return <section aria-label="Factual validation" className="space-y-3 rounded-xl border bg-card p-5">
    <h2 className="font-semibold">{label}</h2>
    <p className="text-sm text-muted-foreground">Validation can miss mistakes and does not guarantee accuracy. Review every claim before using this resume. Resolve errors before exporting.</p>
    <p className="text-xs text-muted-foreground">Profile version {resume.profileVersion}{validation.checkedAt ? ` · Checked ${new Date(validation.checkedAt).toLocaleString()}` : ""}{validation.correctionAttempted ? " · One correction attempted" : ""}</p>
    {!!validation.issues.length && <ul className="space-y-2 text-sm">{validation.issues.map((issue) => <li key={issue.id} className="break-words"><span className="font-semibold">{issue.severity === "error" ? "Error" : "Warning"}{issue.fieldPath ? ` · ${issue.fieldPath}` : ""}: </span>{issue.message}</li>)}</ul>}
  </section>;
}
