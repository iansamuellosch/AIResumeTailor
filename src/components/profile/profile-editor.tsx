"use client";
import { useEffect, useRef, useState } from "react";
import { FormProvider, useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { Ellipsis, FileUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { profileDraftSchema, type ProfessionalProfile } from "@/schemas/profile";
import { getDatabase } from "@/lib/storage/database";
import { openEditorSession, type EditorSession } from "@/lib/storage/profile-editor";
import { editorSections, collections, personalFields, sectionForPath } from "@/lib/profile/editor-config";
import { profileValidationMessage } from "@/lib/profile/validation-messages";
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
        setApprovalError("Please correct the highlighted fields, then try again. Your changes are still saved as a draft.");
        for (const issue of cause.issues) {
          const path = issue.path.join(".") as FieldPath<ProfessionalProfile>;
          form.setError(path, { type: "verification", message: profileValidationMessage(issue) });
          const section = sectionRefs.current[sectionForPath(path)];
          if (section) section.open = true;
        }
        const first = cause.issues[0]?.path.join(".") as FieldPath<ProfessionalProfile> | undefined;
        if (first) {
          openSection(sectionForPath(first));
          requestAnimationFrame(() => form.setFocus(first));
        }
      } else setApprovalError(cause instanceof Error ? cause.message : "Could not save your profile. Existing data has been preserved.");
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
  const approvedUnchanged = !session.revision.draft && JSON.stringify(values) === JSON.stringify(session.profile);
  return <FormProvider {...form}>
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-3xl space-y-3">
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight">Your professional profile</h1><Badge variant="secondary">{approvedUnchanged ? "Saved profile" : "Draft profile"}</Badge></div>
        <p className="leading-7 text-muted-foreground">Review and maintain your professional information.</p>
      </div>
      <div role="group" aria-label="Profile actions" className="flex shrink-0 items-center gap-2">
        {session.revision.verified && <Button asChild><Link href="/dashboard">Continue to Dashboard</Link></Button>}
        {onReplace && <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild><Button type="button" variant="outline" size="icon" aria-label="More profile actions" disabled={disabled || persistence.conflict} className="cursor-pointer"><Ellipsis aria-hidden="true" /></Button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-md">
            <DropdownMenu.Item disabled={disabled || persistence.conflict} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50" onSelect={() => {
              setSaving(true);
              void persistence.saveDraft().then(onReplace).catch(() => setNavigationError("Save your changes before replacing the resume. Your edits are still here.")).finally(() => setSaving(false));
            }}><FileUp aria-hidden="true" className="size-4" />Replace resume</DropdownMenu.Item>
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>}
      </div>
    </header>
    <div className="grid items-start gap-7 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="space-y-4 lg:sticky lg:top-6">
        <div className="hidden lg:block">{sectionNavigation(false)}</div>
        <details ref={mobileNavigation} className="rounded-xl border bg-card lg:hidden">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Jump to section</summary>
          {sectionNavigation(true)}
        </details>
      </aside>
      <form noValidate onSubmit={(event) => event.preventDefault()} className="min-w-0 space-y-5">
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
        {approvalError && <p role="alert" aria-label="Profile save error" className="text-sm leading-6 text-destructive">{approvalError}</p>}
        {navigationError && <p role="alert" className="text-sm text-destructive">{navigationError}</p>}
        {persistence.error && <p role="alert" aria-label="Profile storage error" className="text-sm text-destructive">{persistence.error}</p>}
        {persistence.conflict && <Button type="button" variant="outline" onClick={() => { if (window.confirm("Reload and discard unsaved edits on this page?")) window.location.reload(); }}>Reload saved profile</Button>}
        <div className="flex flex-wrap items-center gap-3 border-t pt-5">
          {persistence.error && !persistence.conflict && <Button type="button" variant="outline" disabled={disabled} onClick={() => void saveDraft()}>{saving ? "Saving…" : "Retry saving"}</Button>}
          <Button type="button" disabled={disabled || persistence.conflict} onClick={() => void approve()}>{persistence.busy ? "Saving…" : "Save & Continue"}</Button>
        </div>
      </form>
    </div>
  </FormProvider>;
}
