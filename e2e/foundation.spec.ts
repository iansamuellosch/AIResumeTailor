import { expect, test } from "@playwright/test";
test("navigation, browser storage, and foundation routes work", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Overview" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Start with your resume");
  await expect(page.getByLabel("Choose a resume file")).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("upload-page.png"), fullPage: true });
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy details" }).click();
  await expect(page).toHaveURL(/\/settings#ai-processing$/);
  await expect(page.getByText("External AI processing", { exact: true })).toBeVisible();
  for (const [label, heading] of [["Profile", "Start with your resume"], ["Dashboard", "Your next opportunity"], ["Settings", "Privacy & local data"]]) {
    await page.getByRole("navigation").getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
  }
  await page.goto("/resume/example");
  await expect(page.getByRole("heading", { name: "Resume preview" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("No saved resume could be loaded in this browser.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
