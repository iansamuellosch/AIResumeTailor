import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResumeDatabase, readProfile, saveProfile } from "@/lib/storage/database";
import { exportProfileBackup, parseProfileImport, readImportRevision, importProfileDraft, deleteUploadedDocuments, deleteSavedResumes, deleteAllLocalData } from "@/lib/storage/data-management";
import { tailoringInput, savedResume } from "./fixtures/tailoring";
import { saveGeneratedResume } from "@/lib/storage/resumes";
let db: ResumeDatabase;
beforeEach(() => { db = new ResumeDatabase(`data-management-${crypto.randomUUID()}`); });
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });
describe("profile import/export", () => {
  it("round-trips profile facts and imports into an unverified draft without overwriting approval", async () => {
    const profile = tailoringInput().profile; await saveProfile(db, profile);
    const backup = await exportProfileBackup(db, "verified"); const imported = parseProfileImport(JSON.stringify(backup));
    const draft = await importProfileDraft(db, imported, await readImportRevision(db));
    expect(draft.status).toBe("draft"); expect(draft.verifiedAt).toBeUndefined(); expect(draft.id).not.toBe(profile.id);
    expect(draft.experience).toEqual(profile.experience); expect(draft.version).toBe(profile.version + 1);
    expect(await readProfile(db, "verified")).toEqual(profile);
  });
  it("round-trips incomplete drafts without treating them as approved", async () => {
    const profile = { ...tailoringInput().profile, status: "draft" as const, verifiedAt: undefined }; profile.personalInfo.email = "unfinished@";
    await saveProfile(db, profile); const backup = await exportProfileBackup(db, "draft");
    const draft = await importProfileDraft(db, parseProfileImport(JSON.stringify(backup)), await readImportRevision(db));
    expect(draft.personalInfo.email).toBe("unfinished@"); expect(await readProfile(db, "verified")).toBeUndefined();
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
  await saveProfile(db, tailoringInput().profile); await db.settings.put({ key: "preference", value: true });
  vi.spyOn(db.uploadedDocuments, "clear").mockRejectedValueOnce(new Error("failure"));
  await expect(deleteAllLocalData(db)).rejects.toThrow("Existing data is preserved"); expect(await db.profiles.count()).toBe(1); expect(await db.settings.count()).toBe(1);
  await deleteAllLocalData(db); for (const table of db.tables) expect(await table.count()).toBe(0);
});
it("rolls back an imported draft when a later storage operation fails", async () => {
  const profile = tailoringInput().profile; await saveProfile(db, profile); const revision = await readImportRevision(db);
  vi.spyOn(db.settings, "delete").mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
  await expect(importProfileDraft(db, profile, revision)).rejects.toThrow("storage is full");
  expect(await db.profileDrafts.count()).toBe(0); expect(await readProfile(db, "verified")).toEqual(profile);
});
