"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { GeneratedResume } from "@/schemas/resume";
import { downloadResume } from "@/lib/export/client";
import type { ExportFormat } from "@/lib/export/document";
export function ExportControls({ resume, disabled = false, dirty = false, editing = false, compact = false }: { resume: GeneratedResume; disabled?: boolean; dirty?: boolean; editing?: boolean; compact?: boolean }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const locked = useRef(false);
  const blocked = editing || dirty || resume.validation.status === "pending-semantic-review" || resume.validation.status === "failed";
  const help = editing ? "Save your changes or cancel editing to return to the preview." : dirty ? "Save your edits before downloading." : resume.validation.status === "failed" ? "AI generation found unsupported claims. Edit and save the resume to correct them before downloading." : "AI generation checks are incomplete. Retry from the dashboard, or edit and save the resume yourself.";
  async function exportDocument(format: ExportFormat) {
    if (locked.current || blocked || disabled) return;
    locked.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const result = await downloadResume(resume, format);
      const target = resume.settings.targetLength === "one-page" ? 1 : resume.settings.targetLength === "two-pages" ? 2 : undefined;
      setMessage(format === "pdf" ? `PDF downloaded · ${result.pageCount} page(s).${target && result.pageCount && result.pageCount > target ? ` Content exceeds your ${target}-page target; nothing was omitted. Shorten the resume to reduce pages.` : ""}` : "Editable Word document downloaded. Pagination may vary with installed fonts and your Word editor.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Document export failed. Your saved resume is unchanged. Try again."); }
    finally { locked.current = false; setBusy(false); }
  }
  return <section aria-label="Resume export" className="space-y-3 rounded-xl border bg-card p-5">
    <h2 className="font-semibold">Download your resume</h2>
    <p className="text-sm text-muted-foreground">{compact ? "Review your resume before using it. Downloads use the layout shown here." : "Files are created on your device. Review your resume and any warnings before using it."}</p>
    {!compact && resume.validation.status === "needs-review" && <details><summary className="cursor-pointer text-sm font-medium">Validation warnings to review</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{resume.validation.issues.map((issue) => <li key={issue.id}>{issue.message}</li>)}</ul></details>}
    {blocked && <p id={`export-help-${resume.id}`} className="text-sm text-muted-foreground">{help}</p>}
    <div className={compact ? "grid gap-2" : "flex flex-wrap gap-2"}><Button disabled={disabled || blocked || busy} aria-describedby={blocked ? `export-help-${resume.id}` : undefined} onClick={() => void exportDocument("pdf")}>Download PDF</Button><Button variant="outline" disabled={disabled || blocked || busy} aria-describedby={blocked ? `export-help-${resume.id}` : undefined} onClick={() => void exportDocument("docx")}>Download Word</Button></div>
    <p role="status" aria-label="Export status" className="text-sm">{busy ? "Preparing document…" : message}</p>
    {error && <p role="alert" aria-label="Export error" className="text-sm text-destructive">{error}</p>}
  </section>;
}
