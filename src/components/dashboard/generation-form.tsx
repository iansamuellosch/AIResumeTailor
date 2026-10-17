"use client";
import { QualityWarnings } from "@/components/resume/quality-warnings";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dashboardInputSchema, defaultResumeSettings, type DashboardInput, type GeneratedResume } from "@/schemas/resume";
import type { ProfessionalProfile } from "@/schemas/profile";
import { getDatabase, readProfile } from "@/lib/storage/database";
import { saveGeneratedResume, updateGeneratedResume } from "@/lib/storage/resumes";
import { requestResumeValidation, requestTailoredResume, type GenerationStage } from "@/lib/generation/client";

const control = "mt-1.5 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";
export function GenerationForm({ profile }: { profile: ProfessionalProfile }) {
  const factCount = [...profile.experience, ...profile.projects].reduce((sum, entry) => sum + entry.responsibilities.length + entry.achievements.length + entry.technologies.length + ("quantifiableResults" in entry ? entry.quantifiableResults.length : Number(Boolean(entry.description))), 0);
  const form = useForm<DashboardInput>({ resolver: zodResolver(dashboardInputSchema), defaultValues: { jobDescription: "", company: "", jobTitle: "", jobUrl: "", notes: "", settings: defaultResumeSettings } });
  const [stage, setStage] = useState<GenerationStage>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState<GeneratedResume>();
  const [saved, setSaved] = useState<GeneratedResume>();
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const reviewPermit = useRef<string | undefined>(undefined);
  const pendingReviewSave = useRef<string | undefined>(undefined);
  const sourceProfile = useRef<ProfessionalProfile | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  async function persist(resume: GeneratedResume) {
    setStage("Saving resume locally");
    if (pendingReviewSave.current) {
      const record = await updateGeneratedResume(getDatabase(), resume, pendingReviewSave.current, "review");
      resume = record.content;
      pendingReviewSave.current = undefined;
    } else await saveGeneratedResume(getDatabase(), resume, sourceProfile.current, reviewPermit.current);
    setSaved(resume); setPending(undefined);
  }
  async function review(resume: GeneratedResume) {
    if (!sourceProfile.current) throw new Error("The approved source profile is unavailable.");
    setStage("Validating facts and correcting unsupported wording");
    const reviewed = await requestResumeValidation(sourceProfile.current, resume, true, controller.current?.signal, reviewPermit.current);
    pendingReviewSave.current = resume.updatedAt;
    setPending(reviewed);
    await persist(reviewed);
  }
  async function retryReview() {
    if (!saved || locked.current) return;
    locked.current = true; setBusy(true); setError("");
    controller.current = new AbortController();
    try { await review(saved); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Factual review failed. Your draft is saved."); }
    finally { setBusy(false); setStage(undefined); locked.current = false; }
  }
  async function generate(input: DashboardInput) {
    if (locked.current) return;
    locked.current = true;
    controller.current = new AbortController();
    setBusy(true); setError(""); setSaved(undefined);
    try {
      const approved = await readProfile(getDatabase(), "verified");
      if (!approved) throw new Error("Approve your profile before generating a resume.");
      sourceProfile.current = approved;
      pendingReviewSave.current = undefined;
      const result = await requestTailoredResume(approved, input, setStage, controller.current.signal);
      if (controller.current.signal.aborted) return;
      reviewPermit.current = result.reviewPermit;
      setPending(result.resume);
      await persist(result.resume);
      await review(result.resume);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Generation failed. Your saved data is preserved."); }
    finally { setBusy(false); setStage(undefined); locked.current = false; }
  }
  async function retrySave() {
    if (!pending || locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try { const needsReview = !pendingReviewSave.current; await persist(pending); if (needsReview) await review(pending); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the resume. Try again."); }
    finally { setBusy(false); setStage(undefined); locked.current = false; }
  }
  const errors = form.formState.errors;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
      <div><h2 className="font-semibold">Your profile is ready</h2><p>{profile.personalInfo.fullName} · Approved profile version {profile.version}</p><p className="mt-1 text-muted-foreground">{profile.experience.length} employment entries · {profile.projects.length} projects · {profile.skills.length} skills · {factCount} supporting facts</p>
        {factCount < 4 && <p className="mt-2 max-w-xl">Your profile has little detailed evidence. Add missing responsibilities, achievements, and outcomes before generating if the original resume contains more detail.</p>}
      </div>
      <Link href="/profile" className="font-medium underline underline-offset-4">Edit approved profile</Link>
    </div>
    <form onSubmit={(event) => void form.handleSubmit(generate)(event)} className="space-y-6">
      <Card><CardContent className="space-y-5">
        <div><label htmlFor="jobDescription" className="text-lg font-semibold">Job description</label>
          <p id="job-hint" className="mt-1 text-sm text-muted-foreground">Paste the full description so relevant experience can be selected.</p>
          <textarea {...form.register("jobDescription")} id="jobDescription" placeholder="Paste the job description here..." rows={12} maxLength={30000} className={control} aria-invalid={!!errors.jobDescription} aria-describedby={`job-hint${errors.jobDescription ? " job-error" : ""}`} />
          {errors.jobDescription && <p id="job-error" className="mt-1 text-sm text-destructive">{errors.jobDescription.message}</p>}
        </div>
        <details><summary className="cursor-pointer text-sm font-medium">Optional job information</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="text-sm font-medium"><label htmlFor="company">Company name</label><input id="company" {...form.register("company")} maxLength={500} className={control} /></div>
            <div className="text-sm font-medium"><label htmlFor="jobTitle">Job title</label><input id="jobTitle" {...form.register("jobTitle")} maxLength={500} className={control} /></div>
            <div className="text-sm font-medium sm:col-span-2"><label htmlFor="jobUrl">Job posting URL</label><input id="jobUrl" {...form.register("jobUrl")} type="url" className={control} aria-invalid={!!errors.jobUrl} aria-describedby={errors.jobUrl ? "url-error" : undefined} />{errors.jobUrl && <span id="url-error" className="text-destructive">{errors.jobUrl.message}</span>}</div>
            <div className="text-sm font-medium sm:col-span-2"><label htmlFor="notes">Additional notes</label><textarea id="notes" {...form.register("notes")} rows={3} maxLength={2000} className={control} /></div>
          </div>
        </details>
      </CardContent></Card>
      <Card><CardContent className="space-y-5">
        <h2 className="text-lg font-semibold">Resume settings</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="text-sm font-medium"><label htmlFor="settings.template">Resume template</label><select id="settings.template" {...form.register("settings.template")} className={control}><option value="modern-professional">Modern Professional</option></select></div>
          <div className="text-sm font-medium"><label htmlFor="settings.targetLength">Target length</label><select id="settings.targetLength" {...form.register("settings.targetLength")} className={control}><option value="automatic">Automatic</option><option value="one-page">One page</option><option value="two-pages">Two pages</option></select></div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Target length guides content selection. Pagination will be finalized during export.</p>
      </CardContent></Card>
      <p className="text-sm leading-6 text-muted-foreground">Your job description and relevant profile information are sent to Google Gemini. Resumes are saved in this browser. Review the generated resume for accuracy.</p>
      <Button type="submit" size="lg" disabled={busy || !!pending}>{busy ? "Processing…" : "Generate Tailored Resume"}</Button>
    </form>
    <div aria-live="polite" aria-atomic="true">{stage && <p role="status" className="text-sm font-medium">{stage}…</p>}</div>
    {error && <p role="alert" className="rounded-lg border border-destructive p-4 text-sm text-destructive">{error}</p>}
    {pending && !busy && <div className="space-y-3 rounded-xl border bg-card p-5"><p className="text-sm">Your generated result is still in this tab and has not been saved. Retry saving before closing or reloading.</p><Button onClick={() => void retrySave()}>Retry saving resume</Button></div>}
    {saved && <div className="space-y-3 rounded-xl border bg-card p-5"><h2 className="font-semibold">Resume saved locally</h2><p className="text-sm text-muted-foreground">{saved.jobAnalysis.jobTitle || "Tailored resume"}{saved.jobAnalysis.company ? ` · ${saved.jobAnalysis.company}` : ""}. Factual review: {saved.validation.status}. Review the result before using it.</p><QualityWarnings warnings={saved.qualityWarnings} />{saved.validation.status !== "passed" && <Button disabled={busy || !!pending} onClick={() => void retryReview()}>Retry factual review</Button>}<Button asChild><Link href={`/resume/${saved.id}`}>Open saved resume</Link></Button></div>}
  </div>;
}
