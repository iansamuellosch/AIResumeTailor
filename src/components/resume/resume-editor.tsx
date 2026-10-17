"use client";
import type { GeneratedResume } from "@/schemas/resume";
import { editableResumeFields, replaceResumeText, pendingValidation } from "@/lib/generation/editing";
export function ResumeEditor({ resume, disabled, onChange }: { resume: GeneratedResume; disabled: boolean; onChange: (resume: GeneratedResume) => void }) {
  const fields = editableResumeFields(resume);
  const groups = [...new Set(fields.map((field) => field.group))];
  return <section aria-label="Resume text editor" className="space-y-3">
    <p className="text-sm text-muted-foreground">Edits affect only this resume. Evidence references stay attached to their bullets. Change and approve your profile first to add or change professional facts.</p>
    {groups.map((group) => <details key={group} open={group === "Summary"} className="rounded-xl border bg-card p-4"><summary className="cursor-pointer font-semibold">{group}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
      {fields.filter((field) => field.group === group).map((field) => {
        const common = { id: `edit-${field.path}`, value: field.value, maxLength: 10000, disabled, className: "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring", onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...replaceResumeText(resume, field.path, event.target.value), validation: pendingValidation() }) };
        return <div key={field.path} className={field.multiline ? "sm:col-span-2" : ""}><label htmlFor={common.id} className="text-sm font-medium capitalize">{field.label}</label>{field.multiline ? <textarea {...common} rows={3} /> : <input {...common} />}</div>;
      })}
    </div></details>)}
  </section>;
}
