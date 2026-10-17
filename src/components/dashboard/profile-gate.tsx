"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getDatabase, readProfile } from "@/lib/storage/database";
import { GenerationForm } from "./generation-form";
import type { ProfessionalProfile } from "@/schemas/profile";

export function ProfileGate() {
  const [profile, setProfile] = useState<ProfessionalProfile>();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void readProfile(getDatabase(), "verified").then((value) => { if (active) { setProfile(value); setLoaded(true); } }).catch((cause: unknown) => {
      if (active) { setLoaded(true); setError(cause instanceof Error ? cause.message : "Could not read your approved profile."); }
    });
    return () => { active = false; };
  }, []);
  if (!loaded) return <p>Checking your profile…</p>;
  if (error) return <p role="alert" className="text-destructive">{error}</p>;
  if (!profile) return <div className="space-y-4 rounded-xl border bg-card p-6">
    <h2 className="text-lg font-semibold">Approve your profile first</h2>
    <p className="text-sm leading-6 text-muted-foreground">Review and approve your professional information before using it to generate resumes. Unverified drafts cannot be used for tailoring.</p>
    <Button asChild><Link href="/profile">Review profile</Link></Button>
  </div>;
  return <GenerationForm profile={profile} />;
}
