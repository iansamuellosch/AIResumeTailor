import { expect, test } from "@playwright/test";
import { createEmptyProfile } from "../src/schemas/profile";
const fixture = (extension: string) => `e2e/fixtures/resume.${extension}`;
function sampleDraft() {
  const draft = createEmptyProfile();
  draft.personalInfo.fullName = "Alex Doe";
  draft.personalInfo.email = "alex@example.com";
  draft.headline = "Software Engineer";
  draft.skills = [{ id: "skill-react", name: "React", category: "frameworks-libraries" }];
  return draft;
}
for (const extension of ["pdf", "docx"]) {
  test(`extracts a real ${extension.toUpperCase()} and persists an unverified profile`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/parse-resume", async (route) => {
      const input = route.request().postDataJSON();
      expect(input.text).toContain("Alex Doe");
      expect(input.text).toContain("Integrated REST APIs");
      expect(input).not.toHaveProperty("file");
      await route.fulfill({ json: { success: true, data: { profile: sampleDraft() } } });
    });
    await page.goto("/");
    await expect(page.getByLabel("Choose a resume file")).toBeEnabled();
    await page.getByLabel("Choose a resume file").setInputFiles(fixture(extension));
    await expect(page).toHaveURL(/\/profile$/, { timeout: 45_000 });
    await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Alex Doe");
    await expect(page.getByText("This is an unverified draft.", { exact: false })).toBeVisible();
    await page.getByLabel("Professional headline", { exact: true }).fill("Frontend Engineer");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(page.getByText("Draft saved locally. It has not been verified.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Professional headline", { exact: true })).toHaveValue("Frontend Engineer");
    await page.goto("/");
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByLabel("Professional headline", { exact: true })).toHaveValue("Frontend Engineer");
    await expect(page.getByLabel("Choose a resume file")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("preserves a failed upload for retry after reload", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/parse-resume", async (route) => {
    attempts++;
    if (attempts === 1) await route.fulfill({ status: 502, json: { success: false, error: { code: "AI_UNAVAILABLE", message: "AI is unavailable. Please retry." } } });
    else await route.fulfill({ json: { success: true, data: { profile: sampleDraft() } } });
  });
  await page.goto("/");
  await expect(page.getByLabel("Choose a resume file")).toBeEnabled();
  await page.getByLabel("Choose a resume file").setInputFiles(fixture("docx"));
  await expect(page.getByRole("alert", { name: "Upload error" })).toContainText("Please retry", { timeout: 45_000 });
  await page.reload();
  await page.getByRole("button", { name: "Retry saved resume" }).click();
  await expect(page).toHaveURL(/\/profile$/, { timeout: 45_000 });
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Alex Doe");
  expect(attempts).toBe(2);
});

test("rejects corrupt files and offers manual profile creation", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/parse-resume", () => { calls++; });
  await page.goto("/");
  await expect(page.getByLabel("Choose a resume file")).toBeEnabled();
  await page.getByLabel("Choose a resume file").setInputFiles({ name: "corrupt.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("corrupt data") });
  await expect(page.getByRole("alert", { name: "Upload error" })).toContainText("corrupt", { timeout: 45_000 });
  await page.getByRole("button", { name: "Create draft manually" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByLabel("Full name", { exact: true }).fill("Manual Profile");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(page.getByText("Draft saved locally. It has not been verified.")).toBeVisible();
  expect(calls).toBe(0);
});

test("asks before replacing a resume and preserves the approved profile", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/parse-resume", async (route) => {
    calls++;
    await route.fulfill({ json: { success: true, data: { profile: sampleDraft() } } });
  });
  await page.goto("/");
  await expect(page.getByLabel("Choose a resume file")).toBeEnabled();
  const approved = { ...sampleDraft(), status: "verified", verifiedAt: new Date().toISOString() };
  approved.updatedAt = approved.verifiedAt;
  await page.evaluate(async (profile) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("ai-resume-tailor");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction("profiles", "readwrite");
        transaction.objectStore("profiles").put({ key: "primary", profile });
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, approved);
  await page.reload();
  await expect(page.getByRole("link", { name: "Continue to Dashboard" })).toBeVisible();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Alex Doe");
  await expect(page.getByLabel("Choose a resume file")).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Profile save status" })).toHaveText("Approved profile saved locally.");
  expect(await page.evaluate(async () => new Promise<number>((resolve, reject) => {
    const open = indexedDB.open("ai-resume-tailor");
    open.onsuccess = () => {
      const db = open.result; const count = db.transaction("profileDrafts").objectStore("profileDrafts").count();
      count.onsuccess = () => { db.close(); resolve(count.result); }; count.onerror = () => reject(count.error);
    };
  }))).toBe(0);
  await page.getByRole("button", { name: "Replace resume", exact: true }).click();
  await expect(page.getByLabel("Choose a resume file")).toBeEnabled();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByLabel("Choose a resume file").setInputFiles(fixture("docx"));
  expect(calls).toBe(0);
  await expect(page.getByText("Saved locally:", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to profile", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Alex Doe");
  await page.getByRole("button", { name: "Replace resume", exact: true }).click();
  await expect(page.getByLabel("Choose a resume file")).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Choose a resume file").setInputFiles(fixture("docx"));
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByText("This is an unverified draft.", { exact: false })).toBeVisible();
  const stored = await page.evaluate(async () => new Promise<unknown>((resolve, reject) => {
    const open = indexedDB.open("ai-resume-tailor");
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction("profiles").objectStore("profiles").get("primary");
      read.onsuccess = () => { db.close(); resolve(read.result.profile); };
      read.onerror = () => reject(read.error);
    };
  }));
  expect(stored).toEqual(approved);
  expect(calls).toBe(1);
});

test("replacement saves pending profile edits and cancelling returns to those edits", async ({ page }) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Create draft manually" }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Pending replacement edits");
  await page.getByRole("button", { name: "Replace resume", exact: true }).click();
  await expect(page.getByLabel("Choose a resume file")).toBeEnabled();
  await page.getByRole("button", { name: "Back to profile", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Pending replacement edits");
  await page.reload();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Pending replacement edits");
});
