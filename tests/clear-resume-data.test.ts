import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ResumeDatabase } from "@/lib/storage/database";
import { clearResumeData } from "@/lib/storage/clear-resume-data";
import { createEmptyProfile } from "@/schemas/profile";
let db: ResumeDatabase;
beforeEach(() => { db = new ResumeDatabase(`clear-${crypto.randomUUID()}`); });
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });
it("clears all resume data and the upload pointer while preserving unrelated preferences", async () => {
  const profile = createEmptyProfile();
  await db.profileDrafts.put({ key: "primary", profile });
  await db.profiles.put({ key: "primary", profile });
  await db.uploadedDocuments.put({ id: "upload", name: "resume.pdf", mimeType: "application/pdf", blob: new Blob(["test"]), createdAt: profile.createdAt });
  await db.generatedResumes.put({ id: "resume", updatedAt: profile.updatedAt, content: {} });
  await db.settings.bulkPut([{ key: "latest-upload", value: "upload" }, { key: "theme", value: "light" }]);
  await clearResumeData(db);
  for (const table of [db.profileDrafts, db.profiles, db.uploadedDocuments, db.generatedResumes]) expect(await table.count()).toBe(0);
  expect(await db.settings.get("latest-upload")).toBeUndefined();
  expect((await db.settings.get("theme"))?.value).toBe("light");
});
it("rolls back every deletion on failure", async () => {
  await db.profileDrafts.put({ key: "primary", profile: createEmptyProfile() });
  vi.spyOn(db.generatedResumes, "clear").mockRejectedValue(new Error("storage failed"));
  await expect(clearResumeData(db)).rejects.toThrow("Existing data has been preserved");
  expect(await db.profileDrafts.count()).toBe(1);
});
