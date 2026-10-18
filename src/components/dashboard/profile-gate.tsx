"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApprovedProfile } from "@/hooks/use-approved-profile";
import { GenerationForm } from "./generation-form";
import { ResumeHistory } from "./resume-history";

export function ProfileGate() {
  const { profile, loaded, error } = useApprovedProfile();
  const router = useRouter();
  useEffect(() => {
    if (loaded && !error && !profile) router.replace("/profile");
  }, [loaded, error, profile, router]);
  if (error) return <div className="space-y-3"><p role="alert" className="text-destructive">{error}</p><Link href="/profile" className="underline underline-offset-4">Go to Profile</Link></div>;
  if (!profile) return <p role="status">{loaded ? "Opening your profile…" : "Checking your profile…"}</p>;
  return <div className="max-w-4xl space-y-6">
    <h1 className="text-3xl font-semibold tracking-tight">Your next opportunity</h1>
    <p className="text-muted-foreground">Turn your experience into a resume for the role you want.</p>
    <GenerationForm profile={profile} />
    <ResumeHistory />
  </div>;
}
