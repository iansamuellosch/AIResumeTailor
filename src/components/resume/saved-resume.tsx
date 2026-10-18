"use client";
import { DropdownMenu } from "radix-ui";
import { ChevronDown, Ellipsis } from "lucide-react";
import { LayoutPicker } from "./layout-picker";
import type { ResumeTemplate } from "@/schemas/resume-template";
import { resumeTemplates } from "@/lib/resume/templates";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getDatabase, readProfile, type StoredResume } from "@/lib/storage/database";
import { readResumeRecord, updateGeneratedResume, restoreGeneratedResume, updateResumeLayout } from "@/lib/storage/resumes";
import { generatedResumeSchema, type GeneratedResume } from "@/schemas/resume";
import { resumeEditError, resumeTextHasChanges } from "@/lib/generation/editing";
import { resumeBlocks } from "@/lib/export/document";
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
  const [layoutsExpanded, setLayoutsExpanded] = useState(false);
  const layoutDisclosure = useRef<HTMLButtonElement>(null);
  const previouslyExpanded = useRef(false);
  useEffect(() => {
    if (busy) return;
    if (previouslyExpanded.current && !layoutsExpanded) layoutDisclosure.current?.focus({ preventScroll: true });
    previouslyExpanded.current = layoutsExpanded;
  }, [layoutsExpanded, busy]);
  const lock = useRef(false);
  const workspace = useRef<HTMLElement>(null);
  const workspaceTitle = useRef<HTMLHeadingElement>(null);
  const previousMode = useRef(false);
  const [activity, setActivity] = useState("");
  useEffect(() => {
    if (previousMode.current === editing) return;
    previousMode.current = editing;
    workspaceTitle.current?.focus({ preventScroll: true });
    workspace.current?.scrollIntoView?.({ block: "start" });
  }, [editing]);
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
  function accept(value: StoredResume) { setRecord(value); setResume(value.content); setDirty(false); setEditing(false); }
  async function save(review: boolean) {
    if (!resume || !record || lock.current) return;
    if (!review && !dirty) { setEditing(false); return; }
    const parsed = generatedResumeSchema.safeParse(resume);
    if (!parsed.success) { setError(resumeEditError(resume, parsed.error.issues)); const path = parsed.error.issues[0]?.path.join("."); if (path) document.getElementById(`edit-${path}`)?.focus(); return; }
    if (!review && !resumeTextHasChanges(parsed.data, record.content)) { accept(record); setMessage("No text changes to save."); return; }
    lock.current = true; setBusy(true); setActivity(review ? "Checking facts…" : "Saving changes…"); setError(""); setMessage("");
    controller.current = new AbortController();
    try {
      let content = parsed.data;
      resumeBlocks(content);
      if (review) {
        const source = record.sourceProfile ?? await readProfile(getDatabase(), "verified");
        if (!source || source.id !== content.profileId || source.version !== content.profileVersion) throw new Error("The approved source profile for this resume is unavailable. Edits can still be saved as unreviewed. Generate a new resume from your current profile to validate against it.");
        content = await requestResumeValidation(source, content, false, controller.current.signal, record.reviewPermit);
      }
      if (controller.current.signal.aborted) return;
      accept(await updateGeneratedResume(getDatabase(), content, record.updatedAt, review ? "review" : "edit"));
      setMessage(review ? "Factual review saved. Review the result before downloading." : "Changes saved locally. Check facts before downloading.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes. Your edits are still in this tab."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function changeLayout(template: ResumeTemplate) {
    if (!record || !resume || lock.current || template === resume.settings.template) return;
    lock.current = true; setBusy(true); setActivity("Saving layout…"); setError("");
    try {
      const updated = await updateResumeLayout(getDatabase(), id, template, record.updatedAt);
      setRecord(updated);
      // Keep unsaved text edits in this tab. Only layout is saved by this action.
      setResume({ ...resume, updatedAt: updated.updatedAt, settings: { ...resume.settings, template } });
      setMessage(`${resumeTemplates[template].name} layout saved.`);
      setLayoutsExpanded(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the layout. Try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function restore() {
    if (!record || lock.current || !window.confirm("Restore the resume originally generated by AI, including its original layout? This replaces your saved and unsaved resume edits. Your profile stays unchanged.")) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    setActivity("Restoring original…");
    try { accept(await restoreGeneratedResume(getDatabase(), id, record.updatedAt)); setMessage("Original generated content restored."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not restore the original."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function reload() {
    if (busy || (dirty && !window.confirm("Discard your unsaved changes and reload the saved resume?"))) return;
    setBusy(true); setActivity("Reloading…"); setError("");
    try { const value = await readResumeRecord(getDatabase(), id); if (!value) throw new Error("This resume is no longer saved."); accept(value); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reload the resume."); }
    finally { setBusy(false); }
  }
  function cancelEditing() {
    if (busy || !record || (dirty && !window.confirm("Discard your unsaved edits and return to the saved resume?"))) return;
    accept(record); setError(""); setMessage("");
  }
  if (!loaded) return <p role="status">Loading saved resume…</p>;
  if (!resume) return <div className="space-y-3">{error && <p role="alert">{error}</p>}<p>No saved resume could be loaded in this browser. <Link href="/dashboard" className="underline">Return to dashboard</Link></p></div>;
  return <div className="space-y-6">
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[auto_1fr]">
      <div className="rounded-xl border bg-card p-3 lg:col-start-2 lg:row-start-1 lg:p-4">
        <button ref={layoutDisclosure} type="button" aria-label="Change resume layout" aria-expanded={layoutsExpanded} aria-controls="resume-layout-options" disabled={busy} onClick={() => setLayoutsExpanded(!layoutsExpanded)} className="flex min-h-9 w-full cursor-pointer items-center justify-between rounded-md text-sm font-medium outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 lg:hidden"><span>Layout: {resumeTemplates[resume.settings.template].name}</span><span className="flex items-center gap-2 text-muted-foreground">Change layout<ChevronDown aria-hidden="true" className={`size-4 ${layoutsExpanded ? "rotate-180" : ""}`} /></span></button>
        <div id="resume-layout-options" className={`${layoutsExpanded ? "mt-3" : "hidden"} lg:mt-0 lg:block`}>
          <LayoutPicker value={resume.settings.template} onChange={(template) => void changeLayout(template)} disabled={busy} compact />
        </div>
        <p className="mt-3 hidden text-xs leading-5 text-muted-foreground lg:block">Layout saves automatically. Your wording stays the same.</p>
      </div>
      <section ref={workspace} aria-label="Resume workspace" className="min-w-0 scroll-mt-4 space-y-4 lg:col-start-1 lg:row-start-1 lg:row-span-2">
        <div className={`${editing ? "sticky top-3 z-20" : ""} space-y-2 rounded-xl border bg-card p-4 shadow-sm`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 ref={workspaceTitle} tabIndex={-1} className="font-semibold focus:outline-none">{editing ? "Edit resume" : "Preview"}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {editing ? <>
                <Button variant="outline" disabled={busy} onClick={cancelEditing}>Cancel</Button>
                <Button disabled={busy} onClick={() => void save(false)}>{activity === "Saving changes…" && busy ? "Saving…" : dirty ? "Save changes" : "Done editing"}</Button>
              </> : <Button disabled={busy} onClick={() => setEditing(true)}>Edit resume</Button>}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild><Button variant="outline" size="icon" disabled={busy} aria-label="More resume actions"><Ellipsis aria-hidden="true" /></Button></DropdownMenu.Trigger>
                <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="z-50 max-w-72 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-md">
                  <DropdownMenu.Item disabled={busy} onSelect={() => void restore()} className="cursor-pointer rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-50"><span className="block font-medium">Restore generated version</span><span className="mt-1 block text-xs text-muted-foreground">Replace edits with the original AI draft.</span></DropdownMenu.Item>
                  <DropdownMenu.Item disabled={busy} onSelect={() => void reload()} className="cursor-pointer rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-50"><span className="block font-medium">Reload saved version</span><span className="mt-1 block text-xs text-muted-foreground">Load the latest copy saved in this browser.</span></DropdownMenu.Item>
                </DropdownMenu.Content></DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>
          <p role="status" aria-label="Resume save status" className="text-xs text-muted-foreground">{busy ? activity : dirty ? "Unsaved resume changes" : message || "Resume saved locally"}</p>
        </div>
        {error && <p role="alert" aria-label="Resume error" className="rounded-lg border border-destructive p-4 text-sm text-destructive">{error}</p>}
        {editing ? <ResumeEditor resume={resume} disabled={busy} onChange={(value) => { const changed = !record || resumeTextHasChanges(value, record.content); setResume(changed ? value : { ...value, validation: record!.content.validation }); setDirty(changed); setMessage(""); setError(""); }} /> : <ResumeDocument resume={resume} />}
      </section>
      <aside aria-label="Review and download" className="space-y-4 lg:col-start-2 lg:row-start-2">
        <ValidationPanel resume={resume} compact>
          <Button variant="outline" className="w-full" disabled={busy || editing} onClick={() => void save(true)}>{busy && activity === "Checking facts…" ? "Checking facts…" : resume.validation.status === "passed" ? "Recheck facts" : "Check facts"}</Button>
          <p className="text-xs leading-5 text-muted-foreground">{editing ? "Save your edits to run a fact check." : "Uses AI to compare this resume with your approved profile. It doesn’t rewrite your resume."}</p>
        </ValidationPanel>
        <ExportControls resume={resume} dirty={dirty} editing={editing} disabled={busy} compact />
      </aside>
    </div>
    {!!resume.qualityWarnings?.length && <details className="rounded-xl border bg-card p-4"><summary className="cursor-pointer font-semibold">Quality suggestions ({resume.qualityWarnings.length})</summary><div className="mt-4"><QualityWarnings warnings={resume.qualityWarnings} /></div></details>}
    {record?.sourceProfile && <details className="rounded-xl border bg-card p-4"><summary className="cursor-pointer font-semibold">How this resume uses your profile</summary><div className="mt-4"><TailoringOverview resume={resume} profile={record.sourceProfile} /></div></details>}
    <EvidencePanel resume={resume} profile={record?.sourceProfile} />
  </div>;
}
