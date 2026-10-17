import Dexie, { type Table } from "dexie";
import { professionalProfileSchema, profileDraftSchema, type ProfessionalProfile } from "@/schemas/profile";

export interface ProfileRecord { key: "primary"; profile: ProfessionalProfile; sourceDocumentId?: string }
export interface UploadedDocument { id: string; name: string; mimeType: string; blob: Blob; createdAt: string }
export interface AppSetting { key: string; value: unknown }
// Reserved until the generated-resume schema is implemented in Milestone 4.
export interface StoredResume { id: string; updatedAt: string; content: unknown }

export class ResumeDatabase extends Dexie {
  profiles!: Table<ProfileRecord, string>;
  profileDrafts!: Table<ProfileRecord, string>;
  uploadedDocuments!: Table<UploadedDocument, string>;
  generatedResumes!: Table<StoredResume, string>;
  settings!: Table<AppSetting, string>;

  constructor(name = "ai-resume-tailor") {
    super(name);
    // Keep version 1 unchanged after release; add version(n).stores(...).upgrade(...) for migrations.
    this.version(1).stores({
      profiles: "key", profileDrafts: "key", uploadedDocuments: "id, createdAt",
      generatedResumes: "id, updatedAt", settings: "key",
    });
  }
}

export class LocalStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "LocalStorageError"; }
}
export function storageErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error && error.name === "QuotaExceededError") return "Browser storage is full. Free space and try again. Your existing data has been preserved.";
  return "Local storage is unavailable. Enable browser storage and try again. Your existing data has not been removed.";
}
export async function openDatabase(db: ResumeDatabase): Promise<void> {
  try { await db.open(); }
  catch (cause) { throw new LocalStorageError(storageErrorMessage(cause), { cause }); }
}

let database: ResumeDatabase | undefined;
/** Call only from client effects or browser event handlers; never opens during SSR. */
export function getDatabase(): ResumeDatabase {
  if (typeof window === "undefined") throw new LocalStorageError("Local data is only available in your browser.");
  return database ??= new ResumeDatabase();
}

export async function saveProfile(db: ResumeDatabase, input: unknown): Promise<ProfessionalProfile> {
  const status = typeof input === "object" && input !== null && "status" in input ? input.status : undefined;
  const profile = (status === "draft" ? profileDraftSchema : professionalProfileSchema).parse(input);
  try {
    const table = profile.status === "verified" ? db.profiles : db.profileDrafts;
    await table.put({ key: "primary", profile });
    return profile;
  } catch (cause) { throw new LocalStorageError(storageErrorMessage(cause), { cause }); }
}
export async function readProfile(db: ResumeDatabase, status: "draft" | "verified"): Promise<ProfessionalProfile | undefined> {
  try {
    const record = await (status === "verified" ? db.profiles : db.profileDrafts).get("primary");
    if (!record) return undefined;
    const profile = (status === "draft" ? profileDraftSchema : professionalProfileSchema).parse(record.profile);
    if (profile.status !== status) throw new Error("Profile status does not match its store");
    return profile;
  } catch (cause) { throw new LocalStorageError("Could not read the local profile. Stored data has been preserved.", { cause }); }
}
