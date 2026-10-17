"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResumeUpload } from "@/components/upload/resume-upload";
import { getDatabase, readProfile } from "@/lib/storage/database";
import { ProfileEditor } from "./profile-editor";

async function readWorkspace() {
  const db = getDatabase();
  const [draft, approved] = await Promise.all([readProfile(db, "draft"), readProfile(db, "verified")]);
  return Boolean(draft || approved);
}

export function ProfileWorkspace() {
  const [hasProfile, setHasProfile] = useState<boolean>();
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState("");
  const accept = useCallback((saved: boolean) => {
    setError(""); setHasProfile(saved); setReplacing(false);
  }, []);
  const fail = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : "Could not open your local profile. Your saved data is preserved.");
  }, []);
  const load = useCallback(() => readWorkspace().then(accept, fail), [accept, fail]);
  useEffect(() => {
    let active = true;
    void readWorkspace().then((saved) => { if (active) accept(saved); }, (cause: unknown) => { if (active) fail(cause); });
    return () => { active = false; };
  }, [accept, fail]);

  if (error) return <div className="space-y-4"><p role="alert" className="text-destructive">{error}</p><Button variant="outline" onClick={() => void load()}>Retry local storage</Button></div>;
  if (hasProfile === undefined) return <p role="status">Loading your profile…</p>;
  const showUpload = !hasProfile || replacing;
  return <div className={showUpload ? "mx-auto flex max-w-xl flex-col gap-8" : "space-y-7"}>
    {showUpload && <div className="max-w-3xl space-y-3">
      <h1 className="text-3xl font-semibold tracking-tight">Your professional profile</h1>
      <p className="leading-7 text-muted-foreground">Start with your existing resume, or create your profile manually. You’ll review your information before using it to tailor a resume.</p>
    </div>}
    {showUpload ? <>
      <ResumeUpload onComplete={() => void load()} onCancel={hasProfile ? () => void load() : undefined} />
      <aside id="upload-disclosure" aria-label="Data disclosure" className="border-t pt-5 text-xs leading-6 text-muted-foreground">
        Your original file and profile draft are stored in this browser. Selecting or dropping a file sends its extracted text through our server to Google Gemini for parsing. The original file stays on your device. AI processing requires an internet connection. Review the draft for accuracy. Clearing browser data can remove local information.
      </aside>
    </> : <ProfileEditor onReplace={() => setReplacing(true)} />}
  </div>;
}
