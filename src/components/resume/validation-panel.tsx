import { editableResumeFields } from "@/lib/generation/editing";
import type { GeneratedResume } from "@/schemas/resume";
export function ValidationPanel({ resume, compact = false, children }: { resume: GeneratedResume; compact?: boolean; children?: React.ReactNode }) {
  const validation = resume.validation;
  const label = { "pending-semantic-review": "Changes need factual review", passed: "Factual checks completed", "needs-review": "Review validation warnings", failed: "Unsupported claims require correction" }[validation.status];
  const description = {
    passed: "Facts have been checked. Review the resume yourself before using it.",
    failed: "Correct the flagged claims, then run another fact check before downloading.",
    "needs-review": "Read the warnings before using your resume.",
    "pending-semantic-review": "Check the wording against your profile before downloading.",
  }[validation.status];
  const fields = editableResumeFields(resume);
  return <section aria-label="Factual validation" className="space-y-3 rounded-xl border bg-card p-5">
    <h2 className="font-semibold">{label}</h2>
    <p className="text-sm text-muted-foreground">{compact ? description : "Validation can miss mistakes and does not guarantee accuracy. Review every claim before using this resume. Resolve errors before exporting."}</p>
    {children}
    <details open={validation.status === "failed" || validation.status === "needs-review" ? true : undefined}><summary className="cursor-pointer text-sm font-medium">Fact check details</summary><div className="mt-3 space-y-3">
    <p className="text-xs text-muted-foreground">Profile version {resume.profileVersion}{validation.checkedAt ? ` · Checked ${new Date(validation.checkedAt).toLocaleString()}` : ""}{validation.correctionAttempted ? " · One correction attempted" : ""}</p>
    {!!validation.issues.length && <ul className="space-y-2 text-sm">{validation.issues.map((issue) => { const field = fields.find((entry) => entry.path === issue.fieldPath); return <li key={issue.id} className="break-words"><span className="font-semibold">{issue.severity === "error" ? "Error" : "Warning"}{field ? ` · ${field.group}: ${field.label}` : ""}: </span>{issue.message}</li>; })}</ul>}
    </div></details>
  </section>;
}
