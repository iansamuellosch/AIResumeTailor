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
  async function backup() {
    const data = await exportProfileBackup(getDatabase());
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "Resume_Profile_Backup.json");
    setMessage("Profile backup downloaded. Keep it somewhere private; it contains personal information.");
  }
  async function importFile(file: File) {
    if (file.size > MAX_PROFILE_IMPORT_BYTES) throw new Error("Profile imports are limited to 2 MB.");
    const profile = parseProfileImport(await file.text()); const db = getDatabase(); const revision = await readImportRevision(db);
    if ((revision.draft || revision.verified) && !window.confirm("Restore this profile backup? It will replace your unfinished profile. Your approved profile stays unchanged until you review and approve the restored information.")) return;
    await importProfileDraft(db, profile, revision);
    // Full reload ensures any cached editor state reflects the imported draft.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Import needs a fresh local editor session.
    window.location.assign("/profile");
  }
  return <>
    <Card><CardHeader><CardTitle>Back up or restore your profile</CardTitle></CardHeader><CardContent className="space-y-5">
      <p className="text-sm leading-6 text-muted-foreground">Download a copy of your profile to keep it safe or move it to another browser. Backups include profile information only, not uploaded files or generated resumes.</p>
      <p className="text-sm leading-6 text-muted-foreground">Your backup includes your approved profile and any unfinished edits saved in this browser.</p>
      <Button disabled={busy} variant="outline" onClick={() => void run(backup)}>Download profile backup</Button>
      <div className="border-t pt-4"><label htmlFor="profile-import" className="block text-sm font-medium">Restore a profile backup</label><p id="profile-import-help" className="mb-3 mt-1 text-sm leading-6 text-muted-foreground">Choose a backup file (.json), up to 2 MB. Your unfinished edits are restored first when available. Review the restored information on the Profile page before approving it.</p><input id="profile-import" type="file" accept=".json,application/json" disabled={busy} aria-describedby="profile-import-help" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void run(() => importFile(file)); }} className="block w-full min-w-0 text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-2 file:font-medium" /></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Delete selected data</CardTitle></CardHeader><CardContent className="divide-y">
      <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="space-y-1"><h3 className="text-sm font-medium">Uploaded resumes</h3><p className="text-sm leading-6 text-muted-foreground">Remove the original files you uploaded. Your profile and generated resumes are kept.</p></div>
        <Button className="shrink-0 sm:w-56" variant="outline" disabled={busy} onClick={() => void run(async () => { if (!window.confirm("Delete all original uploaded files from this browser? Profiles and saved resumes will be kept.")) return; await deleteUploadedDocuments(getDatabase()); setMessage("Uploaded files deleted. Profiles and saved resumes were kept."); })}>Delete uploaded resumes</Button>
      </div>
      <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="space-y-1"><h3 className="text-sm font-medium">Generated resumes</h3><p className="text-sm leading-6 text-muted-foreground">Remove all generated resumes and their saved versions. Your profile and uploaded files are kept.</p></div>
        <Button className="shrink-0 sm:w-56" variant="outline" disabled={busy} onClick={() => void run(async () => { if (!window.confirm("Delete all generated resumes and their saved versions from this browser? This cannot be undone. Your profile and uploaded files will be kept.")) return; await deleteSavedResumes(getDatabase()); setMessage("Saved resumes deleted. Your profile and uploaded files were kept."); })}>Delete generated resumes</Button>
      </div>
    </CardContent></Card>
    <p role="status" aria-label="Local data status" className="text-sm">{busy ? "Updating local data…" : message}</p>{error && <p role="alert" aria-label="Local data error" className="text-sm text-destructive">{error}</p>}
  </>;
}
