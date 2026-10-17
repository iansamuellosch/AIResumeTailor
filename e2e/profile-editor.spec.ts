import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { ProfessionalProfile } from "../src/schemas/profile";

async function openProfile(page: Page) {
  await page.goto("/profile");
  const manual = page.getByRole("button", { name: "Create draft manually" });
  await expect(manual.or(page.getByLabel("Full name", { exact: true }))).toBeVisible();
  if (await manual.isVisible()) await manual.click();
}
async function openSection(page: Page, name: string) {
  const jump = page.locator("summary").filter({ hasText: "Jump to section" });
  await expect(jump).toBeAttached();
  if (await jump.isVisible()) await jump.click();
  await page.getByRole("navigation", { name: "Profile sections" }).getByRole("link", { name: new RegExp(`^${name}`) }).click();
}
async function saved(page: Page) {
  await expect(page.getByRole("status", { name: "Profile save status" })).toHaveText("Draft saved locally. It has not been verified.");
}
async function readProfiles(page: Page) {
  return page.evaluate(async () => new Promise<{ draft?: ProfessionalProfile; verified?: ProfessionalProfile }>((resolve, reject) => {
    const open = indexedDB.open("ai-resume-tailor");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction(["profiles", "profileDrafts"]);
      const approved = transaction.objectStore("profiles").get("primary");
      const draft = transaction.objectStore("profileDrafts").get("primary");
      transaction.oncomplete = () => { db.close(); resolve({ draft: draft.result?.profile, verified: approved.result?.profile }); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

test("employment facts keep their IDs across edits, removal, and approval without reorder controls", async ({ page }) => {
  await openProfile(page);
  await page.getByLabel("Full name", { exact: true }).fill("Alex Doe");
  await page.getByLabel("Professional headline", { exact: true }).fill("Software Engineer");
  await openSection(page, "Work experience");
  await page.getByRole("button", { name: "Add employment", exact: true }).click();
  const first = page.getByRole("group", { name: "Employment 1", exact: true });
  await first.getByLabel("Employer", { exact: true }).fill("Company A");
  await first.getByLabel("Job title", { exact: true }).fill("Engineer");
  await first.getByRole("button", { name: "Add responsibility", exact: true }).click();
  await first.getByLabel("Responsibility 1", { exact: true }).fill("Integrated REST APIs into React applications.");
  await first.getByRole("button", { name: "Add achievement", exact: true }).click();
  await first.getByLabel("Achievement 1", { exact: true }).fill("Improved an existing application workflow.");
  await page.getByRole("button", { name: "Add employment", exact: true }).click();
  const second = page.getByRole("group", { name: "Employment 2", exact: true });
  await second.getByLabel("Employer", { exact: true }).fill("Company B");
  await second.getByLabel("Job title", { exact: true }).fill("Developer");
  await second.getByRole("button", { name: "Add responsibility", exact: true }).click();
  await second.getByLabel("Responsibility 1", { exact: true }).fill("Built a web interface.");
  await saved(page);
  const before = (await readProfiles(page)).draft!;
  await expect(page.getByRole("button", { name: /Move .* (up|down)/ })).toHaveCount(0);
  await first.getByLabel("Responsibility 1", { exact: true }).fill("Integrated REST APIs into production React applications.");
  await first.getByRole("button", { name: "Add responsibility", exact: true }).click();
  await first.getByLabel("Responsibility 2", { exact: true }).fill("Maintained application components.");
  await first.getByRole("button", { name: "Remove responsibility 2", exact: true }).click();
  await saved(page);
  const after = (await readProfiles(page)).draft!;
  expect(after.experience.map((entry) => entry.id)).toEqual([before.experience[0].id, before.experience[1].id]);
  expect(after.experience[0].responsibilities[0].id).toBe(before.experience[0].responsibilities[0].id);
  expect(after.experience[0].responsibilities[0].text).toContain("production React");
  expect(after.experience[1].responsibilities[0].text).toBe("Built a web interface.");
  await page.getByRole("button", { name: "Save & Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Your profile is ready" })).toBeVisible();
  const approved = (await readProfiles(page)).verified!;
  expect(approved.status).toBe("verified");
  expect(approved.verifiedAt).toBeTruthy();
  expect((await readProfiles(page)).draft).toBeUndefined();
  await page.getByRole("link", { name: "Edit approved profile" }).click();
  await openSection(page, "Work experience");
  await first.getByLabel("Employer", { exact: true }).fill("Company A corrected");
  await saved(page);
  expect((await readProfiles(page)).verified).toEqual(approved);
  await page.getByRole("button", { name: "Save & Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect((await readProfiles(page)).verified?.version).toBe(2);
});

test("all optional profile sections can be added, saved, reopened, and removed", async ({ page }) => {
  test.setTimeout(60_000);
  let aiRequests = 0;
  await page.route("**/api/**", () => { aiRequests++; });
  await openProfile(page);
  await page.getByLabel("Full name", { exact: true }).fill("Alex Doe");
  await page.getByLabel("Email", { exact: true }).fill("alex@example.com");
  await page.getByRole("button", { name: "Add website", exact: true }).click();
  await page.getByLabel("Website label", { exact: true }).fill("Portfolio");
  await page.getByLabel(/^Website URL/).fill("https://example.com");
  await openSection(page, "Education");
  await page.getByRole("button", { name: "Add education", exact: true }).click();
  await page.getByLabel("Institution", { exact: true }).fill("Example University");
  await page.getByLabel("Degree", { exact: true }).fill("Bachelor of Science");
  await page.getByLabel("Field of study", { exact: true }).fill("Computer Science");
  await page.getByRole("button", { name: "Add honor", exact: true }).click();
  await page.getByLabel("Honor 1", { exact: true }).fill("Graduated with honors");
  await page.getByRole("button", { name: "Add course", exact: true }).click();
  await page.getByLabel("Course 1", { exact: true }).fill("Data structures");
  await openSection(page, "Skills");
  await page.getByRole("button", { name: "Add skill", exact: true }).click();
  await page.getByLabel("Skill name", { exact: true }).fill("TypeScript");
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("combobox", { name: "Search categories" }).fill("programming");
  await page.getByRole("option", { name: "Programming languages", exact: true }).click();
  await page.getByLabel(/^Experience/).fill("Used in production web applications.");
  await openSection(page, "Projects");
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const project = page.getByRole("group", { name: "Project 1", exact: true });
  await project.getByLabel("Project name", { exact: true }).fill("Personal portfolio");
  await project.getByLabel("Description", { exact: true }).fill("A personal website");
  await project.getByLabel("Role", { exact: true }).fill("Developer");
  await project.getByRole("button", { name: "Add technology", exact: true }).click();
  await project.getByLabel("Technology 1", { exact: true }).fill("React");
  await openSection(page, "Certifications");
  await page.getByRole("button", { name: "Add certification", exact: true }).click();
  await page.getByLabel("Certification name", { exact: true }).fill("Example Certificate");
  await page.getByLabel("Issuing organization", { exact: true }).fill("Example Issuer");
  await openSection(page, "Additional information");
  for (const [button, label, value] of [
    ["Add award", "Award name", "Example Award"],
    ["Add publication", "Publication title", "Example Article"],
    ["Add volunteer entry", "Organization", "Community Group"],
    ["Add membership", "Membership organization", "Professional Group"],
    ["Add language", "Language name", "English"],
    ["Add accomplishment", "Accomplishment", "Presented at an internal team workshop."],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await saved(page);
  const before = (await readProfiles(page)).draft!;
  for (const key of ["education", "skills", "projects", "certifications", "awards", "publications", "volunteerExperience", "memberships", "languages", "additionalAccomplishments"] as const) expect(before[key]).toHaveLength(1);
  expect(before.skills[0].proficiency).toBeUndefined();
  await page.reload();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Alex Doe");
  await openSection(page, "Projects");
  await expect(project.getByLabel("Technology 1", { exact: true })).toHaveValue("React");
  await openSection(page, "Additional information");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete language 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete language 1", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await readProfiles(page)).draft?.languages.length).toBe(0);
  await saved(page);
  const after = (await readProfiles(page)).draft!;
  expect(after.languages).toHaveLength(0);
  expect(after.projects[0].id).toBe(before.projects[0].id);
  expect(after.projects[0].technologies[0].id).toBe(before.projects[0].technologies[0].id);
  expect(after.education[0].honors[0].id).toBe(before.education[0].honors[0].id);
  expect(aiRequests).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Save & Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect((await readProfiles(page)).verified?.projects[0].technologies[0].id).toBe(before.projects[0].technologies[0].id);
});

test("autosaves unfinished fields but blocks approval until errors are corrected", async ({ page }) => {
  await openProfile(page);
  await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save & Continue", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Full name", { exact: true }).fill("Alex Doe");
  await page.getByLabel("Email", { exact: true }).fill("unfinished@");
  await page.getByLabel(/^Portfolio URL/).fill("javascript:alert(1)");
  await openSection(page, "Work experience");
  await page.getByRole("button", { name: "Add employment", exact: true }).click();
  await page.getByLabel(/^Start date/).fill("2025-01");
  await page.getByLabel(/^End date/).fill("2024-01");
  await saved(page);
  const draft = (await readProfiles(page)).draft!;
  expect(draft.personalInfo.email).toBe("unfinished@");
  expect(draft.experience[0].employer).toBe("");
  await page.reload();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("unfinished@");
  await page.getByRole("button", { name: "Save & Continue", exact: true }).click();
  await expect(page.getByRole("alert", { name: "Profile approval error" })).toContainText("correct the highlighted fields");
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");
  expect((await readProfiles(page)).verified).toBeUndefined();
  await page.getByLabel("Email", { exact: true }).fill("alex@example.com");
  await page.getByLabel(/^Portfolio URL/).fill("https://example.com");
  await openSection(page, "Work experience");
  await page.getByLabel("Employer", { exact: true }).fill("Example Company");
  await page.getByLabel("Job title", { exact: true }).fill("Developer");
  await page.getByLabel("Currently employed", { exact: true }).check();
  await expect(page.getByLabel(/^End date/)).toBeDisabled();
  await page.getByRole("button", { name: "Save & Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect((await readProfiles(page)).verified?.experience[0].endDate).toBeUndefined();
});

test("navigation saves pending changes and the dashboard requires approval", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Approve your profile first" })).toBeVisible();
  await page.getByRole("link", { name: "Review profile", exact: true }).click();
  await page.getByRole("button", { name: "Create draft manually" }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Pending Navigation");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await openProfile(page);
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Pending Navigation");
});

test("detects changes from a second tab without overwriting them", async ({ page, context }) => {
  await openProfile(page);
  await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/profile");
  await other.getByLabel("Full name", { exact: true }).fill("Newer Tab Edit");
  await saved(other);
  await page.getByLabel("Full name", { exact: true }).fill("Stale Tab Edit");
  await expect(page.getByRole("alert", { name: "Profile storage error" })).toContainText("changed in another tab");
  await expect(page.getByRole("button", { name: "Save & Continue", exact: true })).toBeDisabled();
  expect((await readProfiles(page)).draft?.personalInfo.fullName).toBe("Newer Tab Edit");
  await other.close();
});

test("compact technology inputs and searchable categories preserve edits and support keyboard selection", async ({ page }, testInfo) => {
  await openProfile(page);
  await page.getByLabel("Full name", { exact: true }).fill("Alex Doe");
  await openSection(page, "Work experience");
  await page.getByRole("button", { name: "Add employment", exact: true }).click();
  await page.getByLabel("Employer", { exact: true }).fill("Example Company");
  await page.getByLabel("Job title", { exact: true }).fill("Coordinator");
  await page.getByLabel("Employment type", { exact: true }).selectOption("Part-time");
  await page.getByRole("button", { name: "Add technology", exact: true }).click();
  await expect(page.getByLabel("Technology 1", { exact: true })).toHaveAttribute("type", "text");
  await page.getByLabel("Technology 1", { exact: true }).fill("Microsoft Excel");
  await page.getByRole("button", { name: "Add technology", exact: true }).click();
  await page.getByLabel("Technology 2", { exact: true }).fill("Salesforce");
  await saved(page);
  const before = (await readProfiles(page)).draft!;
  await page.getByRole("button", { name: "Remove technology 1", exact: true }).click();
  await expect(page.getByLabel("Technology 1", { exact: true })).toHaveValue("Salesforce");
  await saved(page);
  await expect.poll(async () => (await readProfiles(page)).draft!.experience[0].technologies[0].id).toBe(before.experience[0].technologies[1].id);
  await openSection(page, "Skills");
  await page.getByRole("button", { name: "Add skill", exact: true }).click();
  await page.getByLabel("Skill name", { exact: true }).fill("Financial reporting");
  await page.getByLabel("Category", { exact: true }).click();
  const search = page.getByRole("combobox", { name: "Search categories" });
  await search.fill("finance");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await search.press("ArrowDown"); await search.press("Enter");
  await expect(page.getByLabel("Category", { exact: true })).toHaveText("Finance & accounting");
  await page.getByLabel(/^Experience/).fill("Monthly reporting and budget tracking");
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("combobox", { name: "Search categories" }).fill("no such category");
  await expect(page.getByText("No matching categories.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Category", { exact: true })).toHaveText("Finance & accounting");
  await saved(page);
  const stored = (await readProfiles(page)).draft!;
  expect(stored.skills[0].category).toBe("finance-accounting");
  expect(stored.skills[0].supportingContext).toBe("Monthly reporting and budget tracking");
  await expect(page.getByRole("button", { name: /Move .* (up|down)/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("compact-profile.png"), fullPage: true });
  await page.locator("#section-skills").screenshot({ path: testInfo.outputPath("compact-skills.png") });
  await page.locator("#section-experience").screenshot({ path: testInfo.outputPath("compact-employment.png") });
  await page.reload();
  await openSection(page, "Skills");
  await expect(page.getByLabel("Category", { exact: true })).toHaveText("Finance & accounting");
  await expect(page.getByLabel(/^Experience/)).toHaveValue("Monthly reporting and budget tracking");
  await openSection(page, "Work experience");
  await expect(page.getByLabel("Employment type", { exact: true })).toHaveValue("Part-time");
  await expect(page.getByLabel("Technology 1", { exact: true })).toHaveValue("Salesforce");
});
