import { createEmptyProfile, professionalProfileSchema, type ProfessionalProfile } from "@/schemas/profile";
import { validateResumeFile } from "@/lib/parsing/files";
import { LocalStorageError, storageErrorMessage, type ResumeDatabase, type UploadedDocument } from "./database";

export function draftSnapshot(profile?: ProfessionalProfile): string | undefined {
  return profile ? JSON.stringify(profile) : undefined;
}
export async function storeOriginalDocument(db: ResumeDatabase, file: File): Promise<UploadedDocument> {
  validateResumeFile(file);
  const document: UploadedDocument = { id: crypto.randomUUID(), name: file.name, mimeType: file.type, blob: file, createdAt: new Date().toISOString() };
  try {
    await db.transaction("rw", db.uploadedDocuments, db.settings, async () => {
      await db.uploadedDocuments.put(document);
      await db.settings.put({ key: "latest-upload", value: document.id });
    });
    return document;
  } catch (cause) { throw new LocalStorageError(storageErrorMessage(cause), { cause }); }
}
export async function readLatestDocument(db: ResumeDatabase): Promise<UploadedDocument | undefined> {
  try {
    const setting = await db.settings.get("latest-upload");
    if (typeof setting?.value === "string") return await db.uploadedDocuments.get(setting.value);
    return await db.uploadedDocuments.orderBy("createdAt").last();
  } catch (cause) { throw new LocalStorageError(storageErrorMessage(cause), { cause }); }
}

/** Commit only to the draft store, and refuse to overwrite edits made in another tab. */
export async function saveUploadDraft(db: ResumeDatabase, input: unknown, expectedSnapshot: string | undefined, sourceDocumentId?: string): Promise<ProfessionalProfile> {
  const candidate = professionalProfileSchema.parse(input);
  if (candidate.status !== "draft") throw new Error("Only a profile draft can be created from an upload.");
  try {
    return await db.transaction("rw", db.profiles, db.profileDrafts, async () => {
      const current = await db.profileDrafts.get("primary");
      if (draftSnapshot(current?.profile) !== expectedSnapshot) throw new LocalStorageError("Your draft changed in another tab. Reload before trying again. Your original file is still saved.");
      const verified = await db.profiles.get("primary");
      const profile = professionalProfileSchema.parse({
        ...candidate,
        ...(verified ? { id: verified.profile.id, version: verified.profile.version + 1 } : {}),
      });
      await db.profileDrafts.put({ key: "primary", profile, sourceDocumentId });
      return profile;
    });
  } catch (cause) {
    if (cause instanceof LocalStorageError) throw cause;
    throw new LocalStorageError(storageErrorMessage(cause), { cause });
  }
}
export async function createManualDraft(db: ResumeDatabase, expectedSnapshot: string | undefined) {
  return saveUploadDraft(db, createEmptyProfile(), expectedSnapshot);
}
