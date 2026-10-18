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
  return <div className={showUpload ? "mx-auto flex max-w-xl flex-col gap-6 lg:pt-8" : "space-y-7"}>
    {showUpload && <div className="max-w-3xl space-y-3 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Start with your resume</h1>
      <p className="leading-7 text-muted-foreground">We’ll turn it into a profile you can review and edit.</p>
    </div>}
    {showUpload ? <>
      <ResumeUpload onComplete={() => void load()} onCancel={hasProfile ? () => void load() : undefined} />
    </> : <ProfileEditor onReplace={() => setReplacing(true)} />}
  </div>;
}
