import { z } from "zod";
import { professionalProfileSchema, profileDraftSchema, type ProfessionalProfile } from "@/schemas/profile";
import { LocalStorageError, storageErrorMessage, type ResumeDatabase } from "./database";
import { draftSnapshot } from "./uploads";
export const MAX_PROFILE_IMPORT_BYTES = 2 * 1024 * 1024;
const importProfileSchema = z.union([professionalProfileSchema, profileDraftSchema]);
const legacyProfileBackupSchema = z.object({ format: z.literal("ai-resume-tailor-profile"), version: z.literal(1), exportedAt: z.iso.datetime(), profile: importProfileSchema });
export const profileBackupSchema = z.object({
  format: z.literal("ai-resume-tailor-profile"), version: z.literal(2), exportedAt: z.iso.datetime(),
  approvedProfile: professionalProfileSchema.refine((profile) => profile.status === "verified").optional(),
  unfinishedProfile: profileDraftSchema.optional(),
}).refine((backup) => Boolean(backup.approvedProfile || backup.unfinishedProfile), "A backup must contain a saved profile.");
export function parseProfileImport(text: string): ProfessionalProfile {
  if (new TextEncoder().encode(text).byteLength > MAX_PROFILE_IMPORT_BYTES) throw new Error("Profile imports are limited to 2 MB.");
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error("This file is not valid JSON. Your existing profile is unchanged."); }
  const result = z.union([
    // Unfinished edits take priority so restoring never drops work in progress.
    // Every imported version still needs explicit review and approval.
    profileBackupSchema.transform((backup) => (backup.unfinishedProfile ?? backup.approvedProfile)!),
    legacyProfileBackupSchema.transform((backup) => backup.profile), importProfileSchema,
  ]).safeParse(json);
  if (!result.success) throw new Error("This file is not a supported profile backup. Your existing profile is unchanged.");
  return result.data;
}
export async function exportProfileBackup(db: ResumeDatabase) {
  try {
    const backup = await db.transaction("r", db.profiles, db.profileDrafts, async () => {
      const approved = await db.profiles.get("primary");
      const unfinished = await db.profileDrafts.get("primary");
      if (!approved && !unfinished) throw new LocalStorageError("No profile is saved yet. Add your information on the Profile page first.");
      return profileBackupSchema.parse({
        format: "ai-resume-tailor-profile", version: 2, exportedAt: new Date().toISOString(),
        approvedProfile: approved?.profile, unfinishedProfile: unfinished?.profile,
      });
    });
    if (new TextEncoder().encode(JSON.stringify(backup, null, 2)).byteLength > MAX_PROFILE_IMPORT_BYTES) throw new LocalStorageError("This profile backup exceeds the 2 MB limit. Your saved information is unchanged.");
    return backup;
  } catch (cause) { if (cause instanceof LocalStorageError) throw cause; throw new LocalStorageError("Could not download your profile backup. Your local data is unchanged.", { cause }); }
}
export interface ImportRevision { draft?: string; verified?: string }
export async function readImportRevision(db: ResumeDatabase): Promise<ImportRevision> {
  try { return await db.transaction("r", db.profiles, db.profileDrafts, async () => ({ draft: draftSnapshot((await db.profileDrafts.get("primary"))?.profile), verified: draftSnapshot((await db.profiles.get("primary"))?.profile) })); }
  catch (cause) { throw new LocalStorageError(storageErrorMessage(cause), { cause }); }
}
export async function importProfileDraft(db: ResumeDatabase, input: unknown, expected: ImportRevision): Promise<ProfessionalProfile> {
  const parsed = importProfileSchema.parse(input);
  try {
    return await db.transaction("rw", db.profiles, db.profileDrafts, db.settings, async () => {
      const current = await db.profileDrafts.get("primary"); const approved = await db.profiles.get("primary");
      if (draftSnapshot(current?.profile) !== expected.draft || draftSnapshot(approved?.profile) !== expected.verified) throw new LocalStorageError("Your profile changed in another tab. Review the latest profile and import again. Existing data is preserved.");
      const now = new Date().toISOString();
      // Facts retain their IDs. A fresh profile lifecycle prevents imported version metadata from impersonating older resume evidence.
      const profile = profileDraftSchema.parse({ ...parsed, id: crypto.randomUUID(), version: approved ? approved.profile.version + 1 : 1, status: "draft", verifiedAt: undefined, createdAt: now, updatedAt: now });
      await db.profileDrafts.put({ key: "primary", profile }); await db.settings.delete("latest-upload");
      return profile;
    });
  } catch (cause) { if (cause instanceof LocalStorageError) throw cause; throw new LocalStorageError(storageErrorMessage(cause), { cause }); }
}
export async function deleteUploadedDocuments(db: ResumeDatabase) {
  try {
    await db.transaction("rw", db.uploadedDocuments, db.profiles, db.profileDrafts, db.settings, async () => {
      await db.uploadedDocuments.clear(); await db.settings.delete("latest-upload");
      for (const table of [db.profiles, db.profileDrafts]) {
        const record = await table.get("primary"); if (record?.sourceDocumentId) await table.put({ ...record, sourceDocumentId: undefined });
      }
    });
  } catch (cause) { throw new LocalStorageError("Could not delete uploaded files. Existing data is preserved.", { cause }); }
}
export async function deleteSavedResumes(db: ResumeDatabase) {
  try { await db.generatedResumes.clear(); } catch (cause) { throw new LocalStorageError("Could not delete saved resumes. Existing data is preserved.", { cause }); }
}
export async function deleteAllLocalData(db: ResumeDatabase) {
  try { await db.transaction("rw", db.tables, async () => { for (const table of [db.profiles, db.profileDrafts, db.uploadedDocuments, db.generatedResumes, db.settings]) await table.clear(); }); }
  catch (cause) { throw new LocalStorageError("Could not delete all local data. Existing data is preserved.", { cause }); }
}
