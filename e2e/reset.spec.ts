import { expect, test } from "@playwright/test";
test("reset requires confirmation and returns to a fresh upload screen", async ({ page }) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Create draft manually" }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Disposable test profile");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(page.getByRole("status", { name: "Profile save status" })).toContainText("Saved");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Settings" }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete all local data", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete all local data", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByLabel("Choose a resume file")).toBeEnabled();
  await expect(page.getByRole("link", { name: "Continue reviewing draft" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry saved resume" })).toHaveCount(0);
});
