"use client";
import { useState } from "react";
import type { GeneratedResume } from "@/schemas/resume";
import { editableResumeFields, replaceResumeText, manualEditValidation } from "@/lib/generation/editing";
import { ResumeDocument } from "./resume-document";
import { InlineResumeText } from "./inline-resume-text";

export function ResumeEditor({ resume, disabled, onChange }: { resume: GeneratedResume; disabled: boolean; onChange: (resume: GeneratedResume) => void }) {
  const fields = editableResumeFields(resume);
  // Keep originally visible fields in place when cleared, including empty core
  // summary fields, so deletion never unmounts a textbox or loses its focus.
  const [retainedPaths] = useState(() => new Set([...fields.filter((field) => field.value.trim()).map((field) => field.path), "contact.fullName", "headline", "summary"]));
  return <section aria-label="Resume text editor" className="space-y-3">
    <p id="inline-date-help" className="sr-only">Use a month and year, such as Apr 2023 or 2023-04.</p>
    <ResumeDocument resume={resume} retainedPaths={retainedPaths} renderPart={(part) => {
      const field = fields.find((entry) => entry.path === part.path);
      if (!field) return part.text;
      const label = field.label.charAt(0).toUpperCase() + field.label.slice(1);
      const name = ["Contact", "Summary"].includes(field.group) ? label : `${field.group}: ${label}`;
      return <InlineResumeText id={`edit-${field.path}`} value={field.value} label={name} date={/Date$/.test(field.path)} multiline={field.multiline} disabled={disabled} onChange={(text) => onChange({ ...replaceResumeText(resume, field.path, text), validation: manualEditValidation() })} />;
    }} />
  </section>;
}
