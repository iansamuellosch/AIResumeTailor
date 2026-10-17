"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDatabase } from "@/lib/storage/database";
import { clearResumeData } from "@/lib/storage/clear-resume-data";

export function ClearResumeData() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function clear() {
    if (!window.confirm("Delete all uploaded resumes, profile drafts, your approved profile, and saved resumes from this browser? This cannot be undone.")) return;
    setBusy(true); setError("");
    try {
      await clearResumeData(getDatabase());
      // Reload so every cached component starts from the empty database.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- A full reload clears cached local profile state after deletion.
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not clear resume data. Please try again.");
      setBusy(false);
    }
  }
  return <Card>
    <CardHeader><CardTitle>Start over with a new upload</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">Remove uploaded files, profile drafts, your approved profile, and saved resumes from this browser. This cannot be undone.</p>
      <Button variant="destructive" disabled={busy} onClick={() => void clear()}>{busy ? "Clearing…" : "Clear resume data"}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent>
  </Card>;
}
