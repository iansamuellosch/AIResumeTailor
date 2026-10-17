import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile, profileDraftSchema, professionalProfileSchema } from "@/schemas/profile";
import { collections } from "@/lib/profile/editor-config";
import { profileSectionStatus } from "@/lib/profile/completion";
import { ResumeDatabase, readProfile, saveProfile } from "@/lib/storage/database";
import { openEditorSession, persistEditorProfile } from "@/lib/storage/profile-editor";
let db: ResumeDatabase;
beforeEach(() => { db = new ResumeDatabase(`editor-${crypto.randomUUID()}`); });
afterEach(async () => { await db.delete(); });

describe("editable drafts and approval", () => {
  it("preserves incomplete entries and invalid input in a draft, while rejecting approval", async () => {
    const session = await openEditorSession(db);
    const incomplete = { ...session.profile, personalInfo: { ...session.profile.personalInfo, email: "unfinished@" }, experience: [collections.experience.create()] };
    expect(profileDraftSchema.safeParse(incomplete).success).toBe(true);
    expect(professionalProfileSchema.safeParse(incomplete).success).toBe(false);
    const saved = await persistEditorProfile(db, incomplete, session.revision);
    db.close(); await db.open();
    expect((await readProfile(db, "draft"))?.personalInfo.email).toBe("unfinished@");
    await expect(persistEditorProfile(db, incomplete, saved.revision, true)).rejects.toThrow();
    expect(await readProfile(db, "verified")).toBeUndefined();
  });
  it("approves atomically with a timestamp and removes the reviewed draft", async () => {
    const session = await openEditorSession(db);
    const candidate = { ...session.profile, personalInfo: { ...session.profile.personalInfo, fullName: "Alex Doe" } };
    const result = await persistEditorProfile(db, candidate, session.revision, true);
    expect(result.profile.status).toBe("verified");
    expect(result.profile.verifiedAt).toBe(result.profile.updatedAt);
    expect(await readProfile(db, "verified")).toEqual(result.profile);
    expect(await readProfile(db, "draft")).toBeUndefined();
  });
  it("edits an approved profile as an independent draft and only increments versions on approval", async () => {
    const initial = createEmptyProfile(); initial.personalInfo.fullName = "Alex Doe";
    await saveProfile(db, { ...initial, status: "verified", verifiedAt: initial.updatedAt });
    const session = await openEditorSession(db);
    expect(await readProfile(db, "draft")).toBeUndefined();
    expect(session.revision.draft).toBeUndefined();
    expect(session.profile.version).toBe(2);
    expect(session.profile.status).toBe("draft");
    expect(session.profile.verifiedAt).toBeUndefined();
    const edited = { ...session.profile, headline: "A corrected headline" };
    const saved = await persistEditorProfile(db, edited, session.revision);
    expect((await readProfile(db, "verified"))?.headline).toBe("");
    expect((await readProfile(db, "verified"))?.version).toBe(1);
    const approved = await persistEditorProfile(db, edited, saved.revision, true);
    expect(approved.profile.version).toBe(2);
    expect(approved.profile.createdAt).toBe(initial.createdAt);
    expect(approved.profile.headline).toBe("A corrected headline");
  });
  it("preserves entry and fact IDs while entries and facts are edited and reordered", async () => {
    const session = await openEditorSession(db);
    const draft = { ...session.profile, personalInfo: { ...session.profile.personalInfo, fullName: "Alex Doe" },
      experience: [{ id: "employment-a", employer: "A", jobTitle: "Developer", employmentType: "", location: "", workArrangement: "unspecified" as const, currentlyEmployed: false, responsibilities: [{ id: "fact-a", text: "Integrated REST APIs" }], achievements: [], technologies: [], quantifiableResults: [] }, { id: "employment-b", employer: "B", jobTitle: "Developer", employmentType: "", location: "", workArrangement: "unspecified" as const, currentlyEmployed: false, responsibilities: [{ id: "fact-b", text: "Built a UI" }], achievements: [], technologies: [], quantifiableResults: [] }] };
    const saved = await persistEditorProfile(db, draft, session.revision);
    const reordered = { ...draft, experience: [...draft.experience].reverse() };
    const result = await persistEditorProfile(db, reordered, saved.revision, true);
    expect(result.profile.experience.map((entry) => entry.id)).toEqual(["employment-b", "employment-a"]);
    expect(result.profile.experience[1].responsibilities[0].id).toBe("fact-a");
  });
  it("blocks stale draft saves and stale approvals from another tab", async () => {
    const first = await openEditorSession(db);
    const otherTab = await openEditorSession(db);
    await persistEditorProfile(db, { ...otherTab.profile, headline: "Edited elsewhere" }, otherTab.revision);
    await expect(persistEditorProfile(db, first.profile, first.revision)).rejects.toMatchObject({ name: "ProfileConflictError" });
    await expect(persistEditorProfile(db, first.profile, first.revision, true)).rejects.toMatchObject({ name: "ProfileConflictError" });
    expect((await readProfile(db, "draft"))?.headline).toBe("Edited elsewhere");
    expect(await readProfile(db, "verified")).toBeUndefined();
  });
  it("does not recreate a draft after another tab approved it", async () => {
    const first = await openEditorSession(db);
    const candidate = { ...first.profile, personalInfo: { ...first.profile.personalInfo, fullName: "Alex Doe" } };
    await persistEditorProfile(db, candidate, first.revision, true);
    await expect(persistEditorProfile(db, first.profile, first.revision)).rejects.toMatchObject({ name: "ProfileConflictError" });
    expect(await readProfile(db, "draft")).toBeUndefined();
  });
  it("rolls back approval when storage fails, keeping both the draft and approved data", async () => {
    const initial = createEmptyProfile(); initial.personalInfo.fullName = "Alex Doe";
    await saveProfile(db, { ...initial, status: "verified", verifiedAt: initial.updatedAt });
    const session = await openEditorSession(db);
    const draftSession = await persistEditorProfile(db, { ...session.profile, headline: "Draft headline" }, session.revision);
    const spy = vi.spyOn(db.profiles, "put").mockRejectedValue(new DOMException("Full", "QuotaExceededError"));
    await expect(persistEditorProfile(db, draftSession.profile, draftSession.revision, true)).rejects.toThrow("storage is full");
    spy.mockRestore();
    expect((await readProfile(db, "verified"))?.version).toBe(1);
    expect((await readProfile(db, "draft"))?.id).toBe(session.profile.id);
  });
  it("rolls back an approved write if removing the reviewed draft fails", async () => {
    const initial = createEmptyProfile(); initial.personalInfo.fullName = "Alex Doe";
    await saveProfile(db, { ...initial, status: "verified", verifiedAt: initial.updatedAt });
    const session = await openEditorSession(db);
    const draftSession = await persistEditorProfile(db, { ...session.profile, headline: "Draft headline" }, session.revision);
    const spy = vi.spyOn(db.profileDrafts, "delete").mockRejectedValue(new Error("write failed"));
    await expect(persistEditorProfile(db, { ...draftSession.profile, headline: "New headline" }, draftSession.revision, true)).rejects.toThrow();
    spy.mockRestore();
    expect((await readProfile(db, "verified"))?.headline).toBe("");
    expect((await readProfile(db, "verified"))?.version).toBe(1);
    expect(await db.profileDrafts.count()).toBe(1);
  });
  it("retains the uploaded document reference through editing and approval", async () => {
    const draft = createEmptyProfile(); draft.personalInfo.fullName = "Alex Doe";
    await db.profileDrafts.put({ key: "primary", profile: draft, sourceDocumentId: "original-document" });
    const session = await openEditorSession(db);
    const saved = await persistEditorProfile(db, { ...session.profile, summary: "Reviewed summary" }, session.revision);
    await persistEditorProfile(db, saved.profile, saved.revision, true);
    expect((await db.profiles.get("primary"))?.sourceDocumentId).toBe("original-document");
    const editing = await openEditorSession(db);
    expect(await db.profileDrafts.get("primary")).toBeUndefined();
    await persistEditorProfile(db, { ...editing.profile, headline: "Edited headline" }, editing.revision);
    expect((await db.profileDrafts.get("primary"))?.sourceDocumentId).toBe("original-document");
    expect(editing.profile.id).toBe(draft.id);
  });
  it("never accepts verified metadata, duplicate IDs, or tampered identity in draft saves", async () => {
    const session = await openEditorSession(db);
    await expect(persistEditorProfile(db, { ...session.profile, status: "verified" }, session.revision)).rejects.toThrow();
    await expect(persistEditorProfile(db, { ...session.profile, id: "different" }, session.revision)).rejects.toMatchObject({ name: "ProfileConflictError" });
    expect(profileDraftSchema.safeParse({ ...session.profile, skills: [{ id: "same", name: "", category: "other" }, { id: "same", name: "", category: "other" }] }).success).toBe(false);
  });
  it("reports optional empty sections and incomplete added entries without fabricated percentages", () => {
    const profile = createEmptyProfile();
    expect(profileSectionStatus(profile).experience).toBe("Not added");
    expect(profileSectionStatus(profile).personal).toBe("Needs attention");
    const draft = profileDraftSchema.parse({ ...profile, experience: [collections.experience.create()] });
    expect(profileSectionStatus(draft).experience).toBe("Needs attention");
  });
});

it("does not reattach an older uploaded source when a replacement draft has no document", async () => {
  const profile = createEmptyProfile(); profile.personalInfo.fullName = "Approved profile";
  await db.profiles.put({ key: "primary", profile: { ...profile, status: "verified", verifiedAt: profile.updatedAt }, sourceDocumentId: "old-upload" });
  await db.profileDrafts.put({ key: "primary", profile: { ...profile, headline: "Manual replacement" } });
  const session = await openEditorSession(db);
  await persistEditorProfile(db, session.profile, session.revision, true);
  expect((await db.profiles.get("primary"))?.sourceDocumentId).toBeUndefined();
});
