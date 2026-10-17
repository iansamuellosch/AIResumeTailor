import { expect, test } from "@playwright/test";
test("navigation, browser storage, and foundation routes work", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("AI Resume Tailor");
  await expect(page.getByRole("status")).toContainText("Local storage ready");
  for (const [label, heading] of [["Profile", "Your professional profile"], ["Dashboard", "Your next opportunity"], ["Settings", "Privacy & local data"]]) {
    await page.getByRole("navigation").getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
  }
  await page.goto("/resume/example");
  await expect(page.getByRole("heading", { name: "Resume preview" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Local storage ready");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
