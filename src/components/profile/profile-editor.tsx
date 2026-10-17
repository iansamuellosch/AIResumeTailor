"use client";
import { useEffect, useRef, useState } from "react";
import { FormProvider, useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { profileDraftSchema, type ProfessionalProfile } from "@/schemas/profile";
import { getDatabase } from "@/lib/storage/database";
import { openEditorSession, type EditorSession } from "@/lib/storage/profile-editor";
import { editorSections, collections, personalFields, sectionForPath } from "@/lib/profile/editor-config";
import { profileSectionStatus } from "@/lib/profile/completion";
import { useProfilePersistence } from "@/hooks/use-profile-persistence";
import { ProfileField } from "./profile-field";
import { CollectionEditor } from "./collection-editor";

export function ProfileEditor({ onReplace }: { onReplace?: () => void }) {
  const [session, setSession] = useState<EditorSession>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void openEditorSession(getDatabase()).then((loaded) => { if (active) setSession(loaded); }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not open your profile. Existing data has been preserved.");
    });
    return () => { active = false; };
  }, []);
  if (error) return <div className="space-y-4"><p role="alert" className="text-destructive">{error}</p><Button variant="outline" onClick={() => window.location.reload()}>Retry local storage</Button></div>;
  if (!session) return <p>Loading your profile…</p>;
  return <EditorForm session={session} onReplace={onReplace} />;
}

function EditorForm({ session, onReplace }: { session: EditorSession; onReplace?: () => void }) {
  const router = useRouter();
  const form = useForm<ProfessionalProfile>({ defaultValues: session.profile, resolver: zodResolver(profileDraftSchema), shouldUnregister: false });
  const values = useWatch({ control: form.control }) as ProfessionalProfile;
  const completion = profileSectionStatus(values);
  const persistence = useProfilePersistence(form, session, values);
  const [approvalError, setApprovalError] = useState("");
  const [saving, setSaving] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const sectionRefs = useRef<Record<string, HTMLDetailsElement | null>>({});
  const mobileNavigation = useRef<HTMLDetailsElement>(null);

  function openSection(id: string) {
    const section = sectionRefs.current[id];
    if (section) { section.open = true; section.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }
  async function saveDraft() {
    setSaving(true); setNavigationError("");
    try { await persistence.saveDraft(); }
    catch { /* Persistence displays the actionable error. */ }
    finally { setSaving(false); }
  }
  async function approve() {
    form.clearErrors(); setApprovalError("");
    try { await persistence.approve(); router.push("/dashboard"); }
    catch (cause) {
      if (cause instanceof z.ZodError) {
        setApprovalError("Please correct the highlighted fields before approving your profile. Your draft has not been verified.");
        for (const issue of cause.issues) {
          const path = issue.path.join(".") as FieldPath<ProfessionalProfile>;
          form.setError(path, { type: "verification", message: issue.message });
          const section = sectionRefs.current[sectionForPath(path)];
          if (section) section.open = true;
        }
        const first = cause.issues[0]?.path.join(".") as FieldPath<ProfessionalProfile> | undefined;
        if (first) {
          openSection(sectionForPath(first));
          requestAnimationFrame(() => form.setFocus(first));
        }
      } else setApprovalError(cause instanceof Error ? cause.message : "Could not approve your profile. Existing data has been preserved.");
    }
  }

  useEffect(() => {
    // Finish the latest draft write before following application navigation.
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !persistence.hasUnsavedChanges()) return;
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      event.preventDefault(); event.stopPropagation();
      void persistence.saveDraft().then(() => router.push(url.pathname + url.search + url.hash)).catch(() => setNavigationError("The draft could not be saved. Stay on this page and retry before navigating."));
    };
    document.addEventListener("click", navigate, true);
    return () => document.removeEventListener("click", navigate, true);
  }, [persistence, router]);

  function sectionNavigation(mobile: boolean) {
    return <nav aria-label="Profile sections" className={`grid gap-1 rounded-xl bg-card p-2 ${mobile ? "border-t" : "border"}`}>
      {editorSections.map(({ id, title }) => <a key={id} href={`#section-${id}`} onClick={(event) => {
        event.preventDefault();
        if (mobileNavigation.current && mobile) mobileNavigation.current.open = false;
        openSection(id);
      }} className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted">
        <span>{title}</span><span className="shrink-0 text-right text-xs text-muted-foreground">{completion[id]}</span>
      </a>)}
    </nav>;
  }

  const disabled = persistence.busy || saving;
  return <FormProvider {...form}>
    <div className="grid items-start gap-7 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="space-y-4 lg:sticky lg:top-6">
        <div className="flex flex-wrap gap-3">
          {session.revision.verified && <Button asChild variant="outline"><Link href="/dashboard">Continue to Dashboard</Link></Button>}
          {onReplace && <Button type="button" variant="outline" disabled={disabled || persistence.conflict} onClick={() => {
            void persistence.saveDraft().then(onReplace).catch(() => setNavigationError("Save your changes before replacing the resume. Your edits are still here."));
          }}>Replace resume</Button>}
        </div>
        <div className="hidden lg:block">{sectionNavigation(false)}</div>
        <details ref={mobileNavigation} className="rounded-xl border bg-card lg:hidden">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Jump to section</summary>
          {sectionNavigation(true)}
        </details>
        <p role="status" aria-label="Profile save status" className="text-sm leading-6 text-muted-foreground">{persistence.status}</p>
        {session.revision.verified && <p className="text-xs leading-5 text-muted-foreground">Your approved profile stays unchanged until you select Save &amp; Continue.</p>}
        <p className="text-xs leading-5 text-muted-foreground">Add the sections you need. A full name and valid information in each added entry are required for approval.</p>
        {persistence.error && <p role="alert" aria-label="Profile storage error" className="text-sm text-destructive">{persistence.error}</p>}
        {persistence.conflict && <Button variant="outline" onClick={() => { if (window.confirm("Reload and discard unsaved edits on this page?")) window.location.reload(); }}>Reload saved profile</Button>}
      </aside>
      <form noValidate onSubmit={form.handleSubmit(saveDraft)} className="min-w-0 space-y-5">
        <p className="rounded-lg border bg-card p-4 text-sm leading-6">{!session.revision.draft && JSON.stringify(values) === JSON.stringify(session.profile) ? "This is your approved profile. Editing creates a separate draft; approve your changes before using them for generation." : "This is an unverified draft. Edits autosave locally. Check the facts in each section before selecting Save & Continue."}</p>
        <fieldset disabled={disabled} className="min-w-0 space-y-5">
          <legend className="sr-only">Professional profile fields</legend>
          {editorSections.map(({ id, title }) => <details key={id} id={`section-${id}`} ref={(element) => { sectionRefs.current[id] = element; }} open={id === "personal" || id === "summary" ? true : undefined} className="scroll-mt-6 rounded-xl border bg-card">
            <summary className="cursor-pointer rounded-xl px-5 py-4 text-lg font-semibold outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">{title}</summary>
            <div className="space-y-5 border-t p-4 sm:p-5">
              {id === "personal" ? <>
                <div className="grid gap-4 sm:grid-cols-2">{personalFields.map((definition) => <ProfileField key={definition.key} name={`personalInfo.${definition.key}` as FieldPath<ProfessionalProfile>} definition={definition} />)}</div>
                <h3 className="text-base font-semibold">Additional websites</h3><CollectionEditor config={collections.websites} />
              </> : id === "summary" ? <>
                <ProfileField name="headline" definition={{ key: "headline", label: "Professional headline", kind: "textarea" }} />
                <ProfileField name="summary" definition={{ key: "summary", label: "Professional summary", kind: "textarea" }} />
                <ProfileField name="careerObjective" definition={{ key: "careerObjective", label: "Career objective", kind: "textarea", optional: true }} />
              </> : id === "additional" ? <div className="space-y-8">{(["awards", "publications", "volunteerExperience", "memberships", "languages", "additionalAccomplishments"] as const).map((key) => <section key={key} className="space-y-4"><h3 className="text-base font-semibold">{collections[key].title}</h3><CollectionEditor config={collections[key]} /></section>)}</div>
                : <CollectionEditor config={collections[id as "experience" | "education" | "skills" | "projects" | "certifications"]} />}
            </div>
          </details>)}
        </fieldset>
        {approvalError && <p role="alert" aria-label="Profile approval error" className="text-sm leading-6 text-destructive">{approvalError}</p>}
        {navigationError && <p role="alert" className="text-sm text-destructive">{navigationError}</p>}
        <div className="flex flex-wrap gap-3 border-t pt-5">
          <Button type="submit" variant="outline" disabled={disabled || persistence.conflict}>{saving ? "Saving…" : "Save Draft"}</Button>
          <Button type="button" disabled={disabled || persistence.conflict} onClick={() => void approve()}>{persistence.busy ? "Approving…" : "Save & Continue"}</Button>
        </div>
      </form>
    </div>
  </FormProvider>;
}
