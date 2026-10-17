import { LocalStorageError, type ResumeDatabase } from "./database";

export async function clearResumeData(db: ResumeDatabase): Promise<void> {
  try {
    await db.transaction("rw", [db.profiles, db.profileDrafts, db.uploadedDocuments, db.generatedResumes, db.settings], async () => {
      await db.profiles.clear();
      await db.profileDrafts.clear();
      await db.uploadedDocuments.clear();
      await db.generatedResumes.clear();
      await db.settings.delete("latest-upload");
    });
  } catch (cause) {
    throw new LocalStorageError("Could not clear resume data. Existing data has been preserved. Please try again.", { cause });
  }
}
