"use client";
import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { getDatabase, readProfile } from "@/lib/storage/database";
import type { ProfessionalProfile } from "@/schemas/profile";

/** Watch only the approved store: autosaved drafts never unlock generation. */
export function useApprovedProfile() {
  const [state, setState] = useState<{ loaded: boolean; profile?: ProfessionalProfile; error?: string }>({ loaded: false });
  useEffect(() => {
    const subscription = liveQuery(() => readProfile(getDatabase(), "verified")).subscribe({
      next: (profile) => setState({ loaded: true, profile }),
      error: (cause: unknown) => setState({ loaded: true, error: cause instanceof Error ? cause.message : "Could not read your saved profile. Your data has been preserved." }),
    });
    return () => subscription.unsubscribe();
  }, []);
  return state;
}
