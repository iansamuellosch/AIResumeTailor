import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResumeDatabase, readProfile, saveProfile } from "@/lib/storage/database";
import { readGeneratedResume, saveGeneratedResume } from "@/lib/storage/resumes";
import { savedResume, tailoringInput } from "./fixtures/tailoring";
let db: ResumeDatabase;
beforeEach(() => { db = new ResumeDatabase(`resume-${crypto.randomUUID()}`); });
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });
it("recovers a generated resume and its original after reopening without modifying the profile", async () => {
  const profile = tailoringInput().profile; await saveProfile(db, profile);
  const resume = savedResume(); await saveGeneratedResume(db, resume);
  db.close(); await db.open();
  expect(await readGeneratedResume(db, resume.id)).toEqual(resume);
  expect((await db.generatedResumes.get(resume.id))?.originalContent).toEqual(resume);
  expect(await readProfile(db, "verified")).toEqual(profile);
  await expect(saveGeneratedResume(db, resume)).rejects.toThrow();
  expect(await db.generatedResumes.count()).toBe(1);
});
it("rejects invalid content without overwriting saved data", async () => {
  const resume = savedResume(); await saveGeneratedResume(db, resume);
  await expect(saveGeneratedResume(db, { ...resume, profileVersion: 0 })).rejects.toThrow();
  expect(await readGeneratedResume(db, resume.id)).toEqual(resume);
  expect(await readGeneratedResume(db, "missing")).toBeUndefined();
});
it("surfaces quota errors and keeps the caller's result available for retry", async () => {
  const resume = savedResume();
  vi.spyOn(db.generatedResumes, "add").mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
  await expect(saveGeneratedResume(db, resume)).rejects.toThrow("storage is full");
  await saveGeneratedResume(db, resume);
  expect(await readGeneratedResume(db, resume.id)).toEqual(resume);
});

it("saves owner edits independently without claiming AI review, restores the original and retains its evidence snapshot", async () => {
  const input = tailoringInput();
  const { assembleResume } = await import("@/lib/generation/assemble"); const { selectEvidence } = await import("@/lib/generation/evidence"); const { selection } = await import("./fixtures/tailoring");
  const { updateGeneratedResume, restoreGeneratedResume, readResumeRecord } = await import("@/lib/storage/resumes");
  const resume = assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), selection());
  resume.validation = { status: "passed", checkedAt: new Date().toISOString(), issues: [] };
  await saveProfile(db, input.profile); await saveGeneratedResume(db, resume, input.profile);
  const changed = { ...resume, summary: "Manually edited summary." };
  const updated = await updateGeneratedResume(db, changed, resume.updatedAt);
  expect(updated.content.validation).toEqual({ status: "manually-edited", issues: [] });
  expect(updated.originalContent).toEqual(resume);
  expect(updated.sourceProfile).toEqual(input.profile);
  expect(await readProfile(db, "verified")).toEqual(input.profile);
  const restored = await restoreGeneratedResume(db, resume.id, updated.updatedAt);
  expect(restored.content.summary).toBe(resume.summary);
  expect(restored.content.validation.status).toBe("passed");
  expect((await readResumeRecord(db, resume.id))?.originalContent).toEqual(resume);
});
it("detects stale tabs and never resurrects deleted resumes", async () => {
  const { updateGeneratedResume, deleteGeneratedResume } = await import("@/lib/storage/resumes");
  const resume = savedResume(); await saveGeneratedResume(db, resume);
  const updated = await updateGeneratedResume(db, { ...resume, summary: "New summary" }, resume.updatedAt);
  await expect(updateGeneratedResume(db, resume, resume.updatedAt)).rejects.toThrow("another tab");
  await expect(deleteGeneratedResume(db, resume.id, resume.updatedAt)).rejects.toThrow("another tab");
  await deleteGeneratedResume(db, resume.id, updated.updatedAt);
  await expect(updateGeneratedResume(db, resume, updated.updatedAt)).rejects.toThrow("another tab");
  expect(await db.generatedResumes.count()).toBe(0);
});
it("sorts history by last modification and preserves unreadable records", async () => {
  const { listGeneratedResumes, updateGeneratedResume } = await import("@/lib/storage/resumes");
  const first = savedResume(); const second = savedResume();
  await saveGeneratedResume(db, first); await saveGeneratedResume(db, second);
  await updateGeneratedResume(db, { ...first, summary: "Most recently edited" }, first.updatedAt);
  const record = await db.generatedResumes.get(second.id);
  await db.generatedResumes.put({ ...record!, content: { ...second, profileVersion: 0 } });
  const result = await listGeneratedResumes(db);
  expect(result.resumes[0].id).toBe(first.id); expect(result.unreadable).toBe(1);
  expect(await db.generatedResumes.count()).toBe(2);
});
it("does not overwrite edits or originals when a storage write fails", async () => {
  const { updateGeneratedResume } = await import("@/lib/storage/resumes");
  const resume = savedResume(); await saveGeneratedResume(db, resume);
  vi.spyOn(db.generatedResumes, "put").mockRejectedValueOnce(new Error("storage failed"));
  await expect(updateGeneratedResume(db, { ...resume, summary: "Edited" }, resume.updatedAt)).rejects.toThrow();
  expect(await readGeneratedResume(db, resume.id)).toEqual(resume);
  expect((await db.generatedResumes.get(resume.id))?.originalContent).toEqual(resume);
});

it("retains a pending draft, source snapshot and allowance through reload and factual review", async () => {
  const { readResumeRecord, updateGeneratedResume } = await import("@/lib/storage/resumes");
  const resume = savedResume(); const source = { ...tailoringInput().profile, id: resume.profileId };
  await saveGeneratedResume(db, resume, source, "reserved");
  db.close(); await db.open();
  const record = await readResumeRecord(db, resume.id);
  expect(record?.content.validation.status).toBe("pending-semantic-review");
  expect(record?.reviewPermit).toBe("reserved"); expect(record?.sourceProfile).toEqual(source);
  const reviewed = await updateGeneratedResume(db, { ...resume, validation: { status: "passed", checkedAt: new Date().toISOString(), issues: [] } }, resume.updatedAt, "review");
  expect(reviewed.reviewPermit).toBe("reserved");
  expect(reviewed.originalContent.validation.status).toBe("pending-semantic-review");
  expect(await readGeneratedResume(db, resume.id)).not.toHaveProperty("reviewPermit");
});

it("switches layouts without changing content, review, source, or the original; rejects stale updates", async () => {
  const { updateResumeLayout, readResumeRecord, deleteGeneratedResume } = await import("@/lib/storage/resumes");
  const resume = savedResume(); resume.validation = { status: "passed", checkedAt: new Date().toISOString(), issues: [] };
  await saveGeneratedResume(db, resume);
  const updated = await updateResumeLayout(db, resume.id, "classic", resume.updatedAt);
  expect(updated.content).toEqual({ ...resume, settings: { ...resume.settings, template: "classic" }, updatedAt: updated.updatedAt });
  expect(updated.originalContent).toEqual(resume);
  await expect(updateResumeLayout(db, resume.id, "compact", resume.updatedAt)).rejects.toThrow("another tab");
  const compact = await updateResumeLayout(db, resume.id, "compact", updated.updatedAt);
  expect((await readResumeRecord(db, resume.id))?.content.settings.template).toBe("compact");
  expect(compact.content.validation).toEqual(resume.validation);
  await deleteGeneratedResume(db, resume.id, compact.updatedAt);
  await expect(updateResumeLayout(db, resume.id, "classic", compact.updatedAt)).rejects.toThrow("another tab");
  expect(await db.generatedResumes.count()).toBe(0);
});
it("keeps the existing layout and original when a layout save fails", async () => {
  const { updateResumeLayout } = await import("@/lib/storage/resumes");
  const resume = savedResume(); await saveGeneratedResume(db, resume);
  vi.spyOn(db.generatedResumes, "put").mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
  await expect(updateResumeLayout(db, resume.id, "classic", resume.updatedAt)).rejects.toThrow("storage is full");
  expect(await readGeneratedResume(db, resume.id)).toEqual(resume);
});

it("recovers older manual edits without requiring AI review but keeps untouched pending drafts blocked", async () => {
  const { readResumeRecord } = await import("@/lib/storage/resumes");
  const { assertExportable } = await import("@/lib/export/document");
  const original = savedResume(); await saveGeneratedResume(db, original);
  expect(() => assertExportable(original)).toThrow();
  const record = (await db.generatedResumes.get(original.id))!;
  await db.generatedResumes.put({ ...record, content: { ...original, summary: "Previously saved owner edits." } });
  const recovered = (await readResumeRecord(db, original.id))!;
  expect(recovered.content.validation).toEqual({ status: "manually-edited", issues: [] });
  expect(assertExportable(recovered.content).summary).toBe("Previously saved owner edits.");
  expect(recovered.originalContent).toEqual(original);
});
