import { expect, type Page } from "@playwright/test";
import type { ProfessionalProfile } from "../../src/schemas/profile";

export async function readProfiles(page: Page) {
  return page.evaluate(async () => new Promise<{ draft?: ProfessionalProfile; verified?: ProfessionalProfile }>((resolve, reject) => {
    const open = indexedDB.open("ai-resume-tailor"); open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result; const tx = db.transaction(["profiles", "profileDrafts"]);
      const saved = tx.objectStore("profiles").get("primary"); const draft = tx.objectStore("profileDrafts").get("primary");
      tx.oncomplete = () => { db.close(); resolve({ draft: draft.result?.profile, verified: saved.result?.profile }); };
      tx.onerror = () => reject(tx.error);
    };
  }));
}
/** Check persisted data directly; the editor intentionally has no autosave indicator. */
export async function expectDraftValue(page: Page, path: string, expected: unknown) {
  await expect.poll(async () => {
    let value: unknown = (await readProfiles(page)).draft;
    for (const key of path.split(".")) value = value !== null && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
    return value;
  }).toEqual(expected);
}
