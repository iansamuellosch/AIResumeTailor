"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDatabase } from "@/lib/storage/database";
import { downloadBlob } from "@/lib/export/download";
import { exportProfileBackup, parseProfileImport, readImportRevision, importProfileDraft, deleteUploadedDocuments, deleteSavedResumes, MAX_PROFILE_IMPORT_BYTES } from "@/lib/storage/data-management";
export function LocalData() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const lock = useRef(false);
  async function run(action: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not complete this action. Existing local data is preserved."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function backup(status: "verified" | "draft") {
    const data = await exportProfileBackup(getDatabase(), status);
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `Resume_Profile_${status}.json`);
    setMessage("Profile backup downloaded. Keep it somewhere private; it contains personal information.");
  }
  async function importFile(file: File) {
    if (file.size > MAX_PROFILE_IMPORT_BYTES) throw new Error("Profile imports are limited to 2 MB.");
    const profile = parseProfileImport(await file.text()); const db = getDatabase(); const revision = await readImportRevision(db);
    if ((revision.draft || revision.verified) && !window.confirm("Import this profile as a new draft? Your current draft will be replaced. Your approved profile stays unchanged until you review and approve the import.")) return;
    await importProfileDraft(db, profile, revision);
    // Full reload ensures any cached editor state reflects the imported draft.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Import needs a fresh local editor session.
    window.location.assign("/profile");
  }
  return <>
    <Card><CardHeader><CardTitle>Profile backups</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">Export an approved profile or unfinished draft as JSON. These backups include professional facts and stable fact IDs, and exclude original documents and generated resumes. Imported information always needs review and approval.</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} variant="outline" onClick={() => void run(() => backup("verified"))}>Export approved profile</Button><Button disabled={busy} variant="outline" onClick={() => void run(() => backup("draft"))}>Export draft</Button></div>
      <div><label htmlFor="profile-import" className="block text-sm font-medium">Import profile JSON</label><p id="profile-import-help" className="mb-2 text-xs text-muted-foreground">JSON profile backup, up to 2 MB. Replaces the editable draft after confirmation.</p><input id="profile-import" type="file" accept=".json,application/json" disabled={busy} aria-describedby="profile-import-help" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void run(() => importFile(file)); }} className="block w-full min-w-0 text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-2 file:font-medium" /></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Delete selected data</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">Deleting uploads keeps your profiles and saved resumes. Deleting saved resumes also removes their original generated content and source snapshots.</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void run(async () => { if (!window.confirm("Delete all original uploaded files from this browser? Profiles and saved resumes will be kept.")) return; await deleteUploadedDocuments(getDatabase()); setMessage("Uploaded files deleted. Profiles and saved resumes were kept."); })}>Delete uploaded resumes</Button><Button variant="outline" disabled={busy} onClick={() => void run(async () => { if (!window.confirm("Delete all saved resumes, original generated content, and their source snapshots? This cannot be undone.")) return; await deleteSavedResumes(getDatabase()); setMessage("Saved resumes deleted. Your profile and uploaded files were kept."); })}>Delete generated resumes</Button></div>
    </CardContent></Card>
    <p role="status" aria-label="Local data status" className="text-sm">{busy ? "Updating local data…" : message}</p>{error && <p role="alert" aria-label="Local data error" className="text-sm text-destructive">{error}</p>}
  </>;
}
