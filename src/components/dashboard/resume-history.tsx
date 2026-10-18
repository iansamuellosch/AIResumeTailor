"use client";
import { resumeTemplates } from "@/lib/resume/templates";
import Link from "next/link";
import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { ExportControls } from "@/components/resume/export-controls";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/lib/storage/database";
import { listGeneratedResumes, deleteGeneratedResume, readGeneratedResume } from "@/lib/storage/resumes";
import type { GeneratedResume } from "@/schemas/resume";
export function ResumeHistory() {
  const [resumes, setResumes] = useState<GeneratedResume[]>([]);
  const [unreadable, setUnreadable] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const subscription = liveQuery(() => listGeneratedResumes(getDatabase())).subscribe({
      next: (result) => { setResumes(result.resumes); setUnreadable(result.unreadable); setLoaded(true); },
      error: () => { setError("Could not read resume history. Your saved data has been preserved."); setLoaded(true); },
    });
    return () => subscription.unsubscribe();
  }, []);
  async function remove(resume: GeneratedResume) {
    if (!window.confirm(`Delete the saved resume for ${resume.jobAnalysis.jobTitle || "this role"}? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try { await deleteGeneratedResume(getDatabase(), resume.id, resume.updatedAt); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this resume."); }
    finally { setBusy(false); }
  }
  async function download(resume: GeneratedResume) {
    setError("");
    try {
      const content = await readGeneratedResume(getDatabase(), resume.id);
      if (!content) throw new Error("This resume is no longer saved.");
      const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `resume-${resume.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not download this resume."); }
  }
  return <section aria-labelledby="history-heading" className="space-y-4 border-t pt-8">
    <h2 id="history-heading" className="text-xl font-semibold">Resume history</h2>
    <p className="text-sm text-muted-foreground">Saved in this browser, most recently modified first. JSON downloads contain structured resume data. PDF and editable Word exports are available for reviewed resumes.</p>
    {!loaded && <p>Loading resume history…</p>}{error && <p role="alert">{error}</p>}
    {!!unreadable && <p role="alert">{unreadable} saved record(s) could not be read and have been preserved.</p>}
    {loaded && !resumes.length && <p className="text-sm text-muted-foreground">No saved resumes yet.</p>}
    {resumes.map((resume) => <article key={resume.id} className="space-y-3 rounded-xl border bg-card p-5">
      <h3 className="font-semibold">{resume.jobAnalysis.jobTitle || "Tailored resume"}{resume.jobAnalysis.company ? ` · ${resume.jobAnalysis.company}` : ""}</h3>
      <p className="text-xs leading-5 text-muted-foreground">Created {new Date(resume.createdAt).toLocaleString()} · Modified {new Date(resume.updatedAt).toLocaleString()} · {resumeTemplates[resume.settings.template].name} · {resume.validation.status}</p>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/resume/${resume.id}`}>Open resume</Link></Button><Button variant="outline" onClick={() => void download(resume)}>Download JSON</Button><Button disabled={busy} variant="ghost" onClick={() => void remove(resume)}>Delete resume</Button></div>
      <details><summary className="cursor-pointer text-sm font-medium">Document downloads</summary><div className="mt-3"><ExportControls resume={resume} disabled={busy} /></div></details>
    </article>)}
  </section>;
}
