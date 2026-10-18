"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getDatabase, readProfile, type UploadedDocument } from "@/lib/storage/database";
import { createManualDraft, draftSnapshot, readLatestDocument, storeOriginalDocument } from "@/lib/storage/uploads";
import { validateResumeFile } from "@/lib/parsing/files";
import { processStoredDocument } from "@/lib/parsing/workflow";
import type { ProfessionalProfile } from "@/schemas/profile";

export function ResumeUpload({ onComplete, onCancel }: { onComplete?: () => void; onCancel?: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [ready, setReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [document, setDocument] = useState<UploadedDocument>();
  const [draft, setDraft] = useState<ProfessionalProfile>();
  const [verified, setVerified] = useState<ProfessionalProfile>();

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const db = getDatabase();
        const [saved, pending, approved] = await Promise.all([readLatestDocument(db), readProfile(db, "draft"), readProfile(db, "verified")]);
        if (active) { setDocument(saved); setDraft(pending); setVerified(approved); }
      } catch (cause) {
        if (active) { setStorageFailed(true); setError(cause instanceof Error ? cause.message : "Could not read local storage."); }
      } finally { if (active) setReady(true); }
    }
    void load();
    return () => { active = false; };
  }, []);

  function confirmReplacement(): boolean {
    if (draft) return window.confirm("Replace your unfinished profile edits with a new draft? Your saved profile and original files will be kept.");
    if (verified) return window.confirm("Parse a replacement resume into a new draft? Your saved profile will remain unchanged until you review it and select Save & Continue.");
    return true;
  }

  async function processUpload(file?: File) {
    if (!ready || storageFailed || running.current) return;
    try { if (file) validateResumeFile(file); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Choose a PDF or DOCX resume."); return; }
    if (!confirmReplacement()) return;
    running.current = true;
    setError("");
    setBusy("Saving original file…");
    try {
      const db = getDatabase();
      const saved = file ? await storeOriginalDocument(db, file) : document;
      if (!saved) throw new Error("Choose a resume file first.");
      setDocument(saved);
      await processStoredDocument(db, saved, draftSnapshot(draft), setBusy);
      if (onComplete) onComplete(); else router.push("/profile");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not process this resume. Please try again."); }
    finally { running.current = false; setBusy(""); if (input.current) input.current.value = ""; }
  }

  async function startManually() {
    if (running.current || !ready || storageFailed || !confirmReplacement()) return;
    running.current = true;
    setBusy("Creating draft…");
    setError("");
    try { await createManualDraft(getDatabase(), draftSnapshot(draft)); if (onComplete) onComplete(); else router.push("/profile"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create a draft."); }
    finally { running.current = false; setBusy(""); }
  }

  const disabled = !ready || !!busy || storageFailed;
  return (
    <section aria-labelledby="upload-title" className="space-y-5">
      {!onComplete && (verified || draft) && (
        <div className="flex flex-wrap justify-center gap-3">
          {verified && <Button asChild variant="outline"><Link href="/dashboard">Continue to Dashboard</Link></Button>}
          <Button asChild variant="outline"><Link href="/profile">{draft ? "Continue reviewing draft" : "Edit Profile"}</Link></Button>
        </div>
      )}
      <div
        onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault(); setDragging(false);
          if (disabled) return;
          if (event.dataTransfer.files.length !== 1) { setError("Choose one resume at a time."); return; }
          void processUpload(event.dataTransfer.files[0]);
        }}
        className={`flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors motion-reduce:transition-none ${dragging ? "border-primary bg-blue-50" : disabled ? "border-slate-300 bg-card" : "border-slate-300 bg-card hover:border-primary/60 hover:bg-blue-50/40 focus-within:border-primary/60 focus-within:bg-blue-50/40"}`}
        aria-busy={!!busy}
      >
        <Button id="upload-title" size="lg" className="h-11 px-6 text-base" disabled={disabled} aria-describedby="upload-formats footer-tagline" onClick={() => input.current?.click()}>{verified ? "Upload replacement" : "Upload resume"}</Button>
        <p className="mt-3 text-sm text-muted-foreground">or drag and drop here</p>
        <p id="upload-formats" className="mt-2 text-xs text-muted-foreground">PDF or DOCX · Up to 5 MB</p>
        <label htmlFor="resume-file" className="sr-only">Choose a resume file</label>
        <input
          ref={input} id="resume-file" type="file" accept=".pdf,.docx" disabled={disabled}
          aria-describedby="upload-formats footer-tagline"
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void processUpload(file); }}
          className="hidden"
        />
        {busy && <p role="status" className="mt-4 text-sm">{busy}</p>}
        {!ready && <p className="mt-4 text-sm text-muted-foreground">Loading local workspace…</p>}
        {document && <p className="mt-4 max-w-full break-words text-sm text-muted-foreground">{document.name}</p>}
      </div>
      {error && <p role="alert" aria-label="Upload error" className="text-sm leading-6 text-destructive">{error}</p>}
      <div className="space-y-3 text-center">
        {(document || onCancel || storageFailed) && <div className="mx-auto grid w-full max-w-sm gap-3 sm:w-fit sm:max-w-full sm:auto-cols-fr sm:grid-flow-col">
          {document && <Button variant="outline" disabled={disabled} onClick={() => void processUpload()}>Retry saved resume</Button>}
          {onCancel && <Button variant="outline" disabled={disabled} onClick={onCancel}>Back to profile</Button>}
          {storageFailed && <Button variant="outline" onClick={() => window.location.reload()}>Retry local storage</Button>}
        </div>}
        <Button variant="link" className="px-0" disabled={disabled} onClick={() => void startManually()}>Start from scratch</Button>
      </div>
    </section>
  );
}
