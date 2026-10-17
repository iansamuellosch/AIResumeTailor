"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { GeneratedResume } from "@/schemas/resume";
import { downloadResume } from "@/lib/export/client";
import type { ExportFormat } from "@/lib/export/document";
export function ExportControls({ resume, disabled = false, dirty = false }: { resume: GeneratedResume; disabled?: boolean; dirty?: boolean }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const locked = useRef(false);
  const blocked = dirty || resume.validation.status === "pending-semantic-review" || resume.validation.status === "failed";
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
    <p className="text-sm text-muted-foreground">Files are created on your device. Review the preview and any validation warnings before using your resume.</p>
    {resume.validation.status === "needs-review" && <details><summary className="cursor-pointer text-sm font-medium">Validation warnings to review</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{resume.validation.issues.map((issue) => <li key={issue.id}>{issue.message}</li>)}</ul></details>}
    {blocked && <p id={`export-help-${resume.id}`} className="text-sm text-muted-foreground">Save your edits, then check facts and resolve errors to enable PDF and DOCX export.</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={disabled || blocked || busy} aria-describedby={blocked ? `export-help-${resume.id}` : undefined} onClick={() => void exportDocument("pdf")}>Export PDF</Button><Button variant="outline" disabled={disabled || blocked || busy} aria-describedby={blocked ? `export-help-${resume.id}` : undefined} onClick={() => void exportDocument("docx")}>Export DOCX</Button></div>
    <p role="status" aria-label="Export status" className="text-sm">{busy ? "Preparing document…" : message}</p>
    {error && <p role="alert" aria-label="Export error" className="text-sm text-destructive">{error}</p>}
  </section>;
}
