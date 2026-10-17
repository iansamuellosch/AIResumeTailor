"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { ProfessionalProfile } from "@/schemas/profile";
import { getDatabase } from "@/lib/storage/database";
import { persistEditorProfile, ProfileConflictError, type EditorSession } from "@/lib/storage/profile-editor";

export const AUTOSAVE_DELAY_MS = 600;
export function useProfilePersistence(form: UseFormReturn<ProfessionalProfile>, session: EditorSession, values: ProfessionalProfile) {
  const revision = useRef(session.revision);
  const latest = useRef(session.profile);
  const lastSavedContent = useRef(JSON.stringify(session.profile));
  const dirty = useRef(false);
  const paused = useRef(false);
  const conflicted = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [savedContent, setSavedContent] = useState(JSON.stringify(session.profile));
  const initialStatus = session.revision.draft ? "Draft saved locally. It has not been verified." : "Approved profile saved locally.";
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = useCallback((values: ProfessionalProfile) => {
    const candidate = structuredClone(values);
    const fingerprint = JSON.stringify(values);
    const pending = queue.current.then(async () => {
      if (conflicted.current) throw new ProfileConflictError();
      if (fingerprint === lastSavedContent.current) {
        dirty.current = JSON.stringify(latest.current) !== fingerprint;
        if (mounted.current && !dirty.current) setStatus(revision.current.draft ? "Draft saved locally. It has not been verified." : "Approved profile saved locally.");
        return;
      }
      if (mounted.current) { setStatus("Saving draft…"); setError(""); }
      const result = await persistEditorProfile(getDatabase(), candidate, revision.current);
      revision.current = result.revision;
      lastSavedContent.current = fingerprint;
      if (mounted.current) setSavedContent(fingerprint);
      dirty.current = JSON.stringify(latest.current) !== fingerprint;
      if (mounted.current) setStatus(dirty.current ? "Unsaved changes…" : "Draft saved locally. It has not been verified.");
    }).catch((cause: unknown) => {
      if (cause instanceof ProfileConflictError) { conflicted.current = true; if (mounted.current) setConflict(true); }
      if (mounted.current) { setStatus("Draft not saved"); setError(cause instanceof Error ? cause.message : "Could not save your draft. Your edits are still on this page."); }
      throw cause;
    });
    queue.current = pending.catch(() => {});
    return pending;
  }, []);

  const saveDraft = useCallback(async () => {
    clearTimeout(timer.current);
    latest.current = form.getValues();
    await save(latest.current);
  }, [form, save]);

  const approve = useCallback(async () => {
    paused.current = true;
    clearTimeout(timer.current);
    setBusy(true); setError("");
    try {
      await queue.current;
      if (conflicted.current) throw new ProfileConflictError();
      const result = await persistEditorProfile(getDatabase(), form.getValues(), revision.current, true);
      dirty.current = false;
      setStatus("Profile approved and saved locally.");
      return result.profile;
    } catch (cause) {
      if (cause instanceof ProfileConflictError) { conflicted.current = true; setConflict(true); setError(cause.message); }
      paused.current = false;
      // A rejected approval must still preserve unfinished draft input.
      latest.current = form.getValues();
      if (!conflicted.current) void save(latest.current).catch(() => {});
      throw cause;
    } finally { if (mounted.current) setBusy(false); }
  }, [form, save]);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = form.subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        latest.current = structuredClone(values);
        dirty.current = JSON.stringify(values) !== lastSavedContent.current;
        if (!dirty.current || paused.current || conflicted.current) return;
        setStatus("Unsaved changes…");
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { void save(latest.current).catch(() => {}); }, AUTOSAVE_DELAY_MS);
      },
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(form.getValues()) !== lastSavedContent.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", beforeUnload);
      mounted.current = false;
      clearTimeout(timer.current);
      const current = form.getValues();
      if (JSON.stringify(current) !== lastSavedContent.current && !paused.current && !conflicted.current) void save(current).catch(() => {});
    };
  }, [form, save]);

  // Field-array changes can render before their subscription notification. Read
  // the current form for status/navigation so a pending deletion is never shown
  // as saved or skipped when the user immediately leaves the page.
  const hasUnsavedChanges = () => JSON.stringify(form.getValues()) !== lastSavedContent.current;
  const visibleStatus = (status === "Draft saved locally. It has not been verified." || status === "Approved profile saved locally.") && JSON.stringify(values) !== savedContent ? "Unsaved changes…" : status;
  return { saveDraft, approve, status: visibleStatus, error, conflict, busy, hasUnsavedChanges };
}
