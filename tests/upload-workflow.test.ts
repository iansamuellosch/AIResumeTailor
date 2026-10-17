import { Blob, File } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyProfile } from "@/schemas/profile";
import { ResumeDatabase, readProfile, saveProfile } from "@/lib/storage/database";
import { createManualDraft, draftSnapshot, readLatestDocument, saveUploadDraft, storeOriginalDocument } from "@/lib/storage/uploads";
import { processStoredDocument } from "@/lib/parsing/workflow";
let db: ResumeDatabase;
beforeEach(() => { db = new ResumeDatabase(`upload-${crypto.randomUUID()}`); });
afterEach(async () => { await db.delete(); });
const file = () => new File(["Synthetic original resume"], "resume.pdf", { type: "application/pdf" }) as unknown as globalThis.File;

describe("resume upload workflow", () => {
  it("persists the original before processing, stores an unverified draft, and recovers both", async () => {
    const original = await storeOriginalDocument(db, file());
    const result = createEmptyProfile(); result.personalInfo.fullName = "Alex Doe";
    const steps: string[] = [];
    await processStoredDocument(db, original, undefined, (step) => steps.push(step), {
      extract: vi.fn(async () => { expect((await db.uploadedDocuments.get(original.id))?.blob.size).toBeGreaterThan(0); return "Alex Doe Software Engineer"; }),
      parse: vi.fn(async () => result),
    });
    db.close(); await db.open();
    expect((await readLatestDocument(db))?.name).toBe("resume.pdf");
    expect(await readProfile(db, "draft")).toEqual(result);
    expect(await readProfile(db, "verified")).toBeUndefined();
    expect(steps).toEqual(["Reading document…", "Extracting profile with Gemini…", "Saving draft…"]);
  });
  it("preserves original, approved profile, and existing draft after a failed AI operation", async () => {
    const approved = createEmptyProfile(); approved.personalInfo.fullName = "Alex Doe";
    await saveProfile(db, { ...approved, status: "verified", verifiedAt: approved.updatedAt });
    const existing = createEmptyProfile(); await saveProfile(db, existing);
    const original = await storeOriginalDocument(db, file());
    await expect(processStoredDocument(db, original, draftSnapshot(existing), () => {}, {
      extract: async () => "Synthetic resume text here", parse: async () => { throw new Error("Provider unavailable"); },
    })).rejects.toThrow("Provider unavailable");
    expect((await readProfile(db, "verified"))?.personalInfo.fullName).toBe("Alex Doe");
    expect(await readProfile(db, "draft")).toEqual(existing);
    expect((await readLatestDocument(db))?.id).toBe(original.id);
  });
  it("rejects stale results rather than overwriting edits in another tab", async () => {
    const initial = createEmptyProfile(); await saveProfile(db, initial);
    const edited = { ...initial, headline: "Edited while AI was running" }; await saveProfile(db, edited);
    await expect(saveUploadDraft(db, createEmptyProfile(), draftSnapshot(initial))).rejects.toThrow("changed in another tab");
    expect(await readProfile(db, "draft")).toEqual(edited);
  });
  it("can start a manual draft without verifying it or replacing an approved profile", async () => {
    const approved = createEmptyProfile(); approved.personalInfo.fullName = "Alex Doe";
    await saveProfile(db, { ...approved, status: "verified", verifiedAt: approved.updatedAt });
    const draft = await createManualDraft(db, undefined);
    expect(draft.status).toBe("draft");
    expect(draft.id).toBe(approved.id);
    expect(draft.version).toBe(2);
    expect((await readProfile(db, "verified"))?.version).toBe(1);
  });
  it("rejects invalid file metadata and storage failures without calling AI", async () => {
    await expect(storeOriginalDocument(db, new File([new Blob(["bad"])], "resume.exe") as unknown as globalThis.File)).rejects.toThrow("PDF or DOCX");
    const spy = vi.spyOn(db.uploadedDocuments, "put").mockRejectedValue(new DOMException("Full", "QuotaExceededError"));
    await expect(storeOriginalDocument(db, file())).rejects.toThrow("storage is full");
    spy.mockRestore();
    expect(await db.uploadedDocuments.count()).toBe(0);
  });
});
