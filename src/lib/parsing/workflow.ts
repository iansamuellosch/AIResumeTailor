import { extractResumeText } from "./extract";
import { requestProfileDraft } from "./client";
import { saveUploadDraft } from "@/lib/storage/uploads";
import type { ResumeDatabase, UploadedDocument } from "@/lib/storage/database";

export type ProcessingStep = "Reading document…" | "Extracting profile with Gemini…" | "Saving draft…";
export async function processStoredDocument(
  db: ResumeDatabase,
  document: UploadedDocument,
  expectedSnapshot: string | undefined,
  onStep: (step: ProcessingStep) => void,
  services = { extract: extractResumeText, parse: requestProfileDraft },
) {
  const file = new File([document.blob], document.name, { type: document.mimeType });
  onStep("Reading document…");
  const text = await services.extract(file);
  onStep("Extracting profile with Gemini…");
  const draft = await services.parse(text);
  onStep("Saving draft…");
  return saveUploadDraft(db, draft, expectedSnapshot, document.id);
}
