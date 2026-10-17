"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getDatabase, readProfile, type StoredResume } from "@/lib/storage/database";
import { readResumeRecord, updateGeneratedResume, restoreGeneratedResume } from "@/lib/storage/resumes";
import { generatedResumeSchema, type GeneratedResume } from "@/schemas/resume";
import { requestResumeValidation } from "@/lib/generation/client";
import { ExportControls } from "./export-controls";
import { ResumeDocument } from "./resume-document";
import { ResumeEditor } from "./resume-editor";
import { EvidencePanel } from "./evidence-panel";
import { ValidationPanel } from "./validation-panel";
import { QualityWarnings } from "./quality-warnings";
import { TailoringOverview } from "./tailoring-overview";

export function SavedResume({ id }: { id: string }) {
  const [record, setRecord] = useState<StoredResume>();
  const [resume, setResume] = useState<GeneratedResume>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    void readResumeRecord(getDatabase(), id).then((value) => { if (active) { setRecord(value); setResume(value?.content); setLoaded(true); } }).catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : "Could not read this saved resume."); setLoaded(true); } });
    return () => { active = false; controller.current?.abort(); };
  }, [id]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("a[href]")) return;
      if (!window.confirm("Discard unsaved resume changes and leave this page?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  function accept(value: StoredResume) { setRecord(value); setResume(value.content); setDirty(false); }
  async function save(review: boolean) {
    if (!resume || !record || lock.current) return;
    const parsed = generatedResumeSchema.safeParse(resume);
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" ")); return; }
    lock.current = true; setBusy(true); setError(""); setMessage("");
    controller.current = new AbortController();
    try {
      let content = parsed.data;
      if (review) {
        const source = record.sourceProfile ?? await readProfile(getDatabase(), "verified");
        if (!source || source.id !== content.profileId || source.version !== content.profileVersion) throw new Error("The approved source profile for this resume is unavailable. Edits can still be saved as unreviewed. Generate a new resume from your current profile to validate against it.");
        content = await requestResumeValidation(source, content, false, controller.current.signal, record.reviewPermit);
      }
      if (controller.current.signal.aborted) return;
      accept(await updateGeneratedResume(getDatabase(), content, record.updatedAt, review ? "review" : "edit"));
      setMessage(review ? "Factual review saved. Review any issues below." : "Changes saved locally. Check facts before using this resume.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes. Your edits are still in this tab."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function restore() {
    if (!record || lock.current || !window.confirm("Restore the original generated resume? This replaces your saved and unsaved resume edits.")) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try { accept(await restoreGeneratedResume(getDatabase(), id, record.updatedAt)); setMessage("Original generated content restored."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not restore the original."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function reload() {
    if (busy || (dirty && !window.confirm("Discard your unsaved changes and reload the saved resume?"))) return;
    setBusy(true); setError("");
    try { const value = await readResumeRecord(getDatabase(), id); if (!value) throw new Error("This resume is no longer saved."); accept(value); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reload the resume."); }
    finally { setBusy(false); }
  }
  if (!loaded) return <p role="status">Loading saved resume…</p>;
  if (!resume) return <div className="space-y-3">{error && <p role="alert">{error}</p>}<p>No saved resume could be loaded in this browser. <Link href="/dashboard" className="underline">Return to dashboard</Link></p></div>;
  return <div className="space-y-6">
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? "Hide editor" : "Edit resume"}</Button>
      <Button disabled={!dirty || busy} onClick={() => void save(false)}>Save changes</Button>
      <Button variant="outline" disabled={busy} onClick={() => void save(true)}>{busy ? "Processing…" : "Check facts & save"}</Button>
      <Button variant="ghost" disabled={busy} onClick={() => void restore()}>Restore original</Button>
      <Button variant="ghost" disabled={busy} onClick={() => void reload()}>Reload saved resume</Button>
    </div>
    <p role="status" aria-label="Resume save status" className="text-sm">{busy ? "Processing resume…" : dirty ? "Unsaved resume changes" : message || "Resume saved locally"}</p>
    {error && <p role="alert" aria-label="Resume error" className="rounded-lg border border-destructive p-4 text-sm text-destructive">{error}</p>}
    <ValidationPanel resume={resume} />
    <QualityWarnings warnings={resume.qualityWarnings} />
    <TailoringOverview resume={resume} profile={record?.sourceProfile} />
    <ExportControls resume={resume} dirty={dirty} disabled={busy} />
    <EvidencePanel resume={resume} profile={record?.sourceProfile} />
    {editing && <ResumeEditor resume={resume} disabled={busy} onChange={(value) => { setResume(value); setDirty(true); setMessage(""); setError(""); }} />}
    <ResumeDocument resume={resume} />
  </div>;
}
