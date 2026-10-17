import { z } from "zod";
import { createEmptyProfile, professionalProfileSchema, profileDraftSchema, type ProfessionalProfile } from "@/schemas/profile";
import { LocalStorageError, storageErrorMessage, type ResumeDatabase } from "./database";
import { draftSnapshot } from "./uploads";

export interface EditorRevision { draft?: string; verified?: string }
export interface EditorSession { profile: ProfessionalProfile; revision: EditorRevision }
export class ProfileConflictError extends LocalStorageError {
  constructor() { super("This profile changed in another tab. Your edits are still on this page. Reload to load the latest saved profile before continuing."); this.name = "ProfileConflictError"; }
}
function rethrowStorage(error: unknown): never {
  if (error instanceof LocalStorageError || error instanceof z.ZodError) throw error;
  throw new LocalStorageError(storageErrorMessage(error), { cause: error });
}

export async function openEditorSession(db: ResumeDatabase): Promise<EditorSession> {
  try {
    return await db.transaction("rw", db.profiles, db.profileDrafts, async () => {
      const saved = await db.profileDrafts.get("primary");
      const approvedRecord = await db.profiles.get("primary");
      const approved = approvedRecord ? professionalProfileSchema.parse(approvedRecord.profile) : undefined;
      let draft: ProfessionalProfile;
      if (saved) draft = profileDraftSchema.parse(saved.profile);
      else {
        draft = approved ? profileDraftSchema.parse({ ...approved, status: "draft", verifiedAt: undefined, version: approved.version + 1, updatedAt: new Date().toISOString() }) : createEmptyProfile();
        if (!approved) await db.profileDrafts.put({ key: "primary", profile: draft });
      }
      return { profile: draft, revision: { draft: saved || !approved ? draftSnapshot(draft) : undefined, verified: draftSnapshot(approved) } };
    });
  } catch (error) { rethrowStorage(error); }
}

export async function persistEditorProfile(db: ResumeDatabase, input: unknown, expected: EditorRevision, approve = false): Promise<EditorSession> {
  const candidate = profileDraftSchema.parse(input);
  try {
    return await db.transaction("rw", db.profiles, db.profileDrafts, async () => {
      const current = await db.profileDrafts.get("primary");
      const approvedRecord = await db.profiles.get("primary");
      const stored = current?.profile ?? approvedRecord?.profile;
      if (!stored || draftSnapshot(current?.profile) !== expected.draft || draftSnapshot(approvedRecord?.profile) !== expected.verified || candidate.id !== stored.id) throw new ProfileConflictError();
      const now = new Date().toISOString();
      const content = {
        ...candidate,
        // The stored lifecycle fields are authoritative, even for form submissions.
        id: stored.id, createdAt: stored.createdAt,
        version: approvedRecord ? approvedRecord.profile.version + 1 : 1,
        updatedAt: now, status: approve ? "verified" : "draft", verifiedAt: approve ? now : undefined,
      };
      const profile = approve ? professionalProfileSchema.parse(content) : profileDraftSchema.parse(content);
      if (approve) {
        await db.profiles.put({ key: "primary", profile, sourceDocumentId: current ? current.sourceDocumentId : approvedRecord?.sourceDocumentId });
        await db.profileDrafts.delete("primary");
      } else await db.profileDrafts.put({ key: "primary", profile, sourceDocumentId: current ? current.sourceDocumentId : approvedRecord?.sourceDocumentId });
      return { profile, revision: { draft: draftSnapshot(profile)!, verified: approve ? draftSnapshot(profile) : expected.verified } };
    });
  } catch (error) { rethrowStorage(error); }
}
