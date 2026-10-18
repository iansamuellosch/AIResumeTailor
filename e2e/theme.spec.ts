import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { THEME_STORAGE_KEY } from "../src/lib/theme/preference";

test("follows device theme, remembers explicit choices, and synchronizes tabs", async ({ page, context }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /hydrat|did not match/i.test(message.text())) errors.push(message.text()); });
  await page.emulateMedia({ colorScheme: "dark" }); await page.goto("/profile");
  await expect(page.getByRole("button", { name: "Upload resume", exact: true })).toBeEnabled();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Switch to light theme", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("dark-upload.png"), fullPage: true });
  await page.getByRole("button", { name: "Switch to light theme", exact: true }).press("Enter");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe("light");
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to dark theme", exact: true })).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  const other = await context.newPage(); await other.goto("/profile");
  await expect(other.getByRole("button", { name: "Switch to dark theme", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark theme", exact: true }).click();
  await expect(other.getByRole("button", { name: "Switch to light theme", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Privacy & data", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Profile", exact: true })).toHaveCSS("color", "rgb(168, 183, 202)");
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Privacy & data", exact: true })).toHaveCSS("color", "rgb(217, 233, 252)");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("dark-privacy.png"), fullPage: true });
  expect(errors).toEqual([]); await other.close();
});

test("theme controls work even if local preference storage is blocked", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript((key) => {
    const get = Storage.prototype.getItem; const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name) { if (name === key) throw new Error("Preference storage blocked"); return get.call(this, name); };
    Storage.prototype.setItem = function (name, value) { if (name === key) throw new Error("Preference storage blocked"); return set.call(this, name, value); };
  }, THEME_STORAGE_KEY);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Switch to dark theme", exact: true }).click();
  await expect(page.getByRole("button", { name: "Switch to light theme", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
