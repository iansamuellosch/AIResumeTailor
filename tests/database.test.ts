import { Blob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResumeDatabase, openDatabase, readProfile, saveProfile, storageErrorMessage } from "@/lib/storage/database";
import { createEmptyProfile } from "@/schemas/profile";
let db: ResumeDatabase;
beforeEach(() => { db = new ResumeDatabase(`test-${crypto.randomUUID()}`); });
afterEach(async () => { await db.delete(); });
describe("local persistence", () => {
  it("initializes all five stores and recovers a draft after reopening", async () => {
    await openDatabase(db);
    expect(db.tables.map((table) => table.name).sort()).toEqual(["generatedResumes", "profileDrafts", "profiles", "settings", "uploadedDocuments"]);
    const draft = createEmptyProfile();
    await saveProfile(db, draft);
    db.close();
    await openDatabase(db);
    expect(await readProfile(db, "draft")).toEqual(draft);
  });
  it("keeps drafts separate from the single verified profile", async () => {
    const draft = createEmptyProfile();
    const verified = { ...draft, status: "verified", personalInfo: { ...draft.personalInfo, fullName: "Alex Doe" }, verifiedAt: draft.updatedAt };
    await saveProfile(db, verified);
    await saveProfile(db, { ...draft, headline: "Unreviewed change" });
    expect(await readProfile(db, "verified")).toEqual(verified);
    expect((await readProfile(db, "draft"))?.status).toBe("draft");
    await saveProfile(db, { ...verified, headline: "Reviewed change" });
    expect(await db.profiles.count()).toBe(1);
  });
  it("validates writes and stored records without erasing existing data", async () => {
    const draft = createEmptyProfile();
    await saveProfile(db, draft);
    await expect(saveProfile(db, { ...draft, version: 0 })).rejects.toThrow();
    expect(await readProfile(db, "draft")).toEqual(draft);
    await db.profileDrafts.put({ key: "primary", profile: { ...draft, version: 0 } });
    await expect(readProfile(db, "draft")).rejects.toThrow("Stored data has been preserved");
    expect(await db.profileDrafts.count()).toBe(1);
  });
  it("stores original document blobs and settings", async () => {
    await db.uploadedDocuments.put({ id: "doc", name: "resume.pdf", mimeType: "application/pdf", blob: new Blob(["original"]) as unknown as globalThis.Blob, createdAt: new Date().toISOString() });
    await db.settings.put({ key: "theme", value: "light" });
    db.close();
    await openDatabase(db);
    expect((await db.uploadedDocuments.get("doc"))?.blob.size).toBe(8);
    expect((await db.settings.get("theme"))?.value).toBe("light");
  });
  it("reports unavailable storage and quota errors", async () => {
    const spy = vi.spyOn(db, "open").mockRejectedValue(new Error("unavailable"));
    await expect(openDatabase(db)).rejects.toThrow("Local storage is unavailable");
    spy.mockRestore();
    expect(storageErrorMessage(new DOMException("Full", "QuotaExceededError"))).toContain("storage is full");
  });
});
