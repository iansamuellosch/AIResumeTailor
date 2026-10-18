import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResumeDatabase, readProfile, saveProfile } from "@/lib/storage/database";
import { THEME_STORAGE_KEY } from "@/lib/theme/preference";
import { exportProfileBackup, parseProfileImport, readImportRevision, importProfileDraft, deleteUploadedDocuments, deleteSavedResumes, deleteAllLocalData } from "@/lib/storage/data-management";
import { tailoringInput, savedResume } from "./fixtures/tailoring";
import { saveGeneratedResume } from "@/lib/storage/resumes";
let db: ResumeDatabase;
beforeEach(() => { db = new ResumeDatabase(`data-management-${crypto.randomUUID()}`); });
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });
describe("profile import/export", () => {
  it("round-trips profile facts and imports into an unverified draft without overwriting approval", async () => {
    const profile = tailoringInput().profile; await saveProfile(db, profile);
    const backup = await exportProfileBackup(db); const imported = parseProfileImport(JSON.stringify(backup));
    const draft = await importProfileDraft(db, imported, await readImportRevision(db));
    expect(draft.status).toBe("draft"); expect(draft.verifiedAt).toBeUndefined(); expect(draft.id).not.toBe(profile.id);
    expect(draft.experience).toEqual(profile.experience); expect(draft.version).toBe(profile.version + 1);
    expect(await readProfile(db, "verified")).toEqual(profile);
  });
  it("round-trips incomplete drafts without treating them as approved", async () => {
    const profile = { ...tailoringInput().profile, status: "draft" as const, verifiedAt: undefined }; profile.personalInfo.email = "unfinished@";
    await saveProfile(db, profile); const backup = await exportProfileBackup(db);
    const draft = await importProfileDraft(db, parseProfileImport(JSON.stringify(backup)), await readImportRevision(db));
    expect(draft.personalInfo.email).toBe("unfinished@"); expect(await readProfile(db, "verified")).toBeUndefined();
  });
  it("backs up both versions and restores unfinished edits without changing existing approval", async () => {
    const approved = tailoringInput().profile;
    const unfinished = { ...structuredClone(approved), status: "draft" as const, verifiedAt: undefined, headline: "Edits in progress" };
    unfinished.personalInfo.email = "unfinished@";
    await saveProfile(db, approved); await saveProfile(db, unfinished);
    const backup = await exportProfileBackup(db);
    expect(backup.version).toBe(2);
    expect(backup.approvedProfile).toEqual(approved);
    expect(backup.unfinishedProfile).toEqual(unfinished);
    const restored = await importProfileDraft(db, parseProfileImport(JSON.stringify(backup)), await readImportRevision(db));
    expect(restored.headline).toBe("Edits in progress");
    expect(restored.personalInfo.email).toBe("unfinished@");
    expect(restored.status).toBe("draft");
    expect(await readProfile(db, "verified")).toEqual(approved);
  });
  it("accepts old backups and raw profiles for review", () => {
    const profile = tailoringInput().profile;
    expect(parseProfileImport(JSON.stringify({ format: "ai-resume-tailor-profile", version: 1, exportedAt: profile.updatedAt, profile }))).toEqual(profile);
    expect(parseProfileImport(JSON.stringify(profile))).toEqual(profile);
  });
  it("rejects empty backups and invalid versions even when the other profile is valid", async () => {
    await expect(exportProfileBackup(db)).rejects.toThrow("No profile is saved yet");
    const base = { format: "ai-resume-tailor-profile", version: 2, exportedAt: new Date().toISOString() };
    expect(() => parseProfileImport(JSON.stringify(base))).toThrow("not a supported profile backup");
    expect(() => parseProfileImport(JSON.stringify({ ...base, approvedProfile: tailoringInput().profile, unfinishedProfile: {} }))).toThrow();
    expect(() => parseProfileImport(JSON.stringify({ ...base, approvedProfile: { ...tailoringInput().profile, status: "draft", verifiedAt: undefined } }))).toThrow();
  });
  it("does not export a file larger than the restore limit", async () => {
    const profile = { ...tailoringInput().profile, status: "draft" as const, verifiedAt: undefined };
    profile.additionalAccomplishments = Array.from({ length: 220 }, (_, index) => ({ id: `oversized-accomplishment-${index}`, text: "x".repeat(10000) }));
    await saveProfile(db, profile);
    await expect(exportProfileBackup(db)).rejects.toThrow("2 MB limit");
    expect((await readProfile(db, "draft"))?.additionalAccomplishments).toHaveLength(220);
  });
  it("rejects invalid, corrupt, oversized, duplicate-ID and unsupported backup versions", () => {
    const profile = tailoringInput().profile;
    for (const value of ["{", "{}", '"text"', JSON.stringify({ ...profile, version: 0 }), JSON.stringify({ ...profile, skills: [{ ...profile.skills[0], id: profile.experience[0].id }] }), JSON.stringify({ format: "ai-resume-tailor-profile", version: 100, profile })]) expect(() => parseProfileImport(value)).toThrow();
    expect(() => parseProfileImport(" ".repeat(2 * 1024 * 1024 + 1))).toThrow("2 MB");
  });
  it("blocks imports when another tab changes the profile before commit", async () => {
    const profile = tailoringInput().profile; await saveProfile(db, profile); const expected = await readImportRevision(db);
    await saveProfile(db, { ...profile, headline: "Newer approved version" });
    await expect(importProfileDraft(db, profile, expected)).rejects.toThrow("another tab");
    expect((await readProfile(db, "verified"))?.headline).toBe("Newer approved version"); expect(await db.profileDrafts.count()).toBe(0);
  });
});
it("deletes uploads and pointers without deleting professional facts or resumes", async () => {
  const profile = tailoringInput().profile; await db.profiles.put({ key: "primary", profile, sourceDocumentId: "upload" });
  await db.uploadedDocuments.put({ id: "upload", name: "resume.pdf", mimeType: "application/pdf", blob: new Blob(["test"]), createdAt: profile.createdAt });
  await db.settings.put({ key: "latest-upload", value: "upload" }); await saveGeneratedResume(db, savedResume());
  await deleteUploadedDocuments(db);
  expect(await db.uploadedDocuments.count()).toBe(0); expect(await db.settings.get("latest-upload")).toBeUndefined(); expect((await db.profiles.get("primary"))?.sourceDocumentId).toBeUndefined();
  expect(await readProfile(db, "verified")).toEqual(profile); expect(await db.generatedResumes.count()).toBe(1);
  await deleteSavedResumes(db); expect(await db.generatedResumes.count()).toBe(0); expect(await readProfile(db, "verified")).toEqual(profile);
});
it("rolls back failed deletions and deletes all local settings only for a complete wipe", async () => {
  localStorage.setItem(THEME_STORAGE_KEY, "dark");
  await saveProfile(db, tailoringInput().profile); await db.settings.put({ key: "preference", value: true });
  vi.spyOn(db.uploadedDocuments, "clear").mockRejectedValueOnce(new Error("failure"));
  await expect(deleteAllLocalData(db)).rejects.toThrow("Existing data is preserved"); expect(await db.profiles.count()).toBe(1); expect(await db.settings.count()).toBe(1);
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  await deleteAllLocalData(db); for (const table of db.tables) expect(await table.count()).toBe(0);
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
});
it("rolls back an imported draft when a later storage operation fails", async () => {
  const profile = tailoringInput().profile; await saveProfile(db, profile); const revision = await readImportRevision(db);
  vi.spyOn(db.settings, "delete").mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
  await expect(importProfileDraft(db, profile, revision)).rejects.toThrow("storage is full");
  expect(await db.profileDrafts.count()).toBe(0); expect(await readProfile(db, "verified")).toEqual(profile);
});
