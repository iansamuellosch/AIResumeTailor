import type { ResumeTemplate } from "@/schemas/resume-template";
import { generatedResumeSchema, type GeneratedResume } from "@/schemas/resume";
import { professionalProfileSchema, type ProfessionalProfile } from "@/schemas/profile";
import { manualEditValidation, resumeTextHasChanges } from "@/lib/generation/editing";
import { LocalStorageError, storageErrorMessage, type ResumeDatabase, type StoredResume } from "./database";

export async function saveGeneratedResume(db: ResumeDatabase, input: unknown, source?: ProfessionalProfile, reviewPermit?: string): Promise<GeneratedResume> {
  const content = generatedResumeSchema.parse(input);
  const sourceProfile = source ? professionalProfileSchema.parse(source) : undefined;
  if (sourceProfile && (sourceProfile.status !== "verified" || sourceProfile.id !== content.profileId || sourceProfile.version !== content.profileVersion)) throw new Error("Source profile does not match the generated resume.");
  try {
    await db.generatedResumes.add({ id: content.id, updatedAt: content.updatedAt, content, originalContent: content, sourceProfile, reviewPermit });
    return content;
  } catch (cause) { throw new LocalStorageError(storageErrorMessage(cause), { cause }); }
}
function parseRecord(record: StoredResume): StoredResume {
  if (record.reviewPermit !== undefined && (typeof record.reviewPermit !== "string" || record.reviewPermit.length > 4096)) throw new Error("Invalid review permit");
  let content = generatedResumeSchema.parse(record.content);
  const originalContent = generatedResumeSchema.parse(record.originalContent);
  const sourceProfile = record.sourceProfile ? professionalProfileSchema.parse(record.sourceProfile) : undefined;
  if (content.id !== record.id || content.updatedAt !== record.updatedAt || originalContent.id !== content.id || originalContent.profileId !== content.profileId || originalContent.profileVersion !== content.profileVersion) throw new Error("Resume record mismatch");
  if (sourceProfile && (sourceProfile.status !== "verified" || sourceProfile.id !== content.profileId || sourceProfile.version !== content.profileVersion)) throw new Error("Source profile mismatch");
  // Older versions saved owner edits as awaiting AI review. Recognize those
  // edits without changing the original AI draft or marking them AI-validated.
  if (content.validation.status === "pending-semantic-review" && resumeTextHasChanges(content, originalContent)) content = { ...content, validation: manualEditValidation() };
  return { ...record, content, originalContent, sourceProfile };
}
export async function readResumeRecord(db: ResumeDatabase, id: string): Promise<StoredResume | undefined> {
  try { const record = await db.generatedResumes.get(id); return record ? parseRecord(record) : undefined; }
  catch (cause) { throw new LocalStorageError("Could not read this saved resume. Stored data has been preserved.", { cause }); }
}
export async function readGeneratedResume(db: ResumeDatabase, id: string): Promise<GeneratedResume | undefined> {
  return (await readResumeRecord(db, id))?.content;
}
const conflict = () => new LocalStorageError("This resume changed in another tab. Reload it before saving. Your edits are still in this tab.");
/** Compare-and-swap prevents lost edits, deleted-record resurrection, and original replacement. */
export async function updateGeneratedResume(db: ResumeDatabase, input: unknown, expectedUpdatedAt: string, mode: "edit" | "review" = "edit"): Promise<StoredResume> {
  const content = generatedResumeSchema.parse(input);
  try {
    return await db.transaction("rw", db.generatedResumes, async () => {
      const existing = await db.generatedResumes.get(content.id);
      if (!existing || existing.updatedAt !== expectedUpdatedAt) throw conflict();
      const record = parseRecord(existing);
      if (content.profileId !== record.content.profileId || content.profileVersion !== record.content.profileVersion || content.createdAt !== record.content.createdAt) throw new Error("Resume provenance cannot be changed.");
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1)).toISOString();
      const updated = { ...record, updatedAt, content: { ...content, updatedAt, validation: mode === "edit" ? manualEditValidation() : content.validation } };
      await db.generatedResumes.put(updated); return updated;
    });
  } catch (cause) { if (cause instanceof LocalStorageError) throw cause; throw new LocalStorageError(storageErrorMessage(cause), { cause }); }
}
export async function restoreGeneratedResume(db: ResumeDatabase, id: string, expectedUpdatedAt: string): Promise<StoredResume> {
  const record = await readResumeRecord(db, id);
  if (!record || record.updatedAt !== expectedUpdatedAt) throw conflict();
  return updateGeneratedResume(db, record.originalContent, expectedUpdatedAt, "review");
}
export async function deleteGeneratedResume(db: ResumeDatabase, id: string, expectedUpdatedAt: string) {
  try {
    await db.transaction("rw", db.generatedResumes, async () => {
      const record = await db.generatedResumes.get(id);
      if (!record || record.updatedAt !== expectedUpdatedAt) throw conflict();
      await db.generatedResumes.delete(id);
    });
  } catch (cause) { if (cause instanceof LocalStorageError) throw cause; throw new LocalStorageError(storageErrorMessage(cause), { cause }); }
}
export async function listGeneratedResumes(db: ResumeDatabase): Promise<{ resumes: GeneratedResume[]; unreadable: number }> {
  try {
    const records = await db.generatedResumes.orderBy("updatedAt").reverse().toArray();
    const resumes: GeneratedResume[] = []; let unreadable = 0;
    for (const record of records) { try { resumes.push(parseRecord(record).content); } catch { unreadable++; } }
    return { resumes, unreadable };
  } catch (cause) { throw new LocalStorageError(storageErrorMessage(cause), { cause }); }
}

/** Change only presentation, preserving factual review and the immutable original. */
export async function updateResumeLayout(db: ResumeDatabase, id: string, template: ResumeTemplate, expectedUpdatedAt: string): Promise<StoredResume> {
  try {
    return await db.transaction("rw", db.generatedResumes, async () => {
      const existing = await db.generatedResumes.get(id);
      if (!existing || existing.updatedAt !== expectedUpdatedAt) throw conflict();
      const record = parseRecord(existing);
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1)).toISOString();
      const content = generatedResumeSchema.parse({ ...record.content, updatedAt, settings: { ...record.content.settings, template } });
      const updated = { ...record, updatedAt, content };
      await db.generatedResumes.put(updated);
      return updated;
    });
  } catch (cause) { if (cause instanceof LocalStorageError) throw cause; throw new LocalStorageError(storageErrorMessage(cause), { cause }); }
}
