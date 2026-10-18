import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { tailoringInput, selection } from "../tests/fixtures/tailoring";
import { assembleResume } from "../src/lib/generation/assemble";
import { selectEvidence } from "../src/lib/generation/evidence";

async function seedApprovedProfile(page: Page, input = tailoringInput()) {
  await page.goto("/");
  await expect(page.getByRole("contentinfo").getByRole("status")).toContainText("Local storage ready");
  await page.evaluate(async (profile) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("ai-resume-tailor");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction("profiles", "readwrite");
      tx.objectStore("profiles").put({ key: "primary", profile });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), input.profile);
  return input;
}

test("tailors an approved profile, saves locally, and recovers a readable result after reload", async ({ page }) => {
  const input = await seedApprovedProfile(page);
  let analysisCalls = 0; let generationCalls = 0; let reviewCalls = 0;
  await page.route("**/api/analyze-job", async (route) => {
    analysisCalls++;
    expect(route.request().postDataJSON()).not.toHaveProperty("profile");
    await route.fulfill({ json: { success: true, data: { jobAnalysis: input.jobAnalysis } } });
  });
  const resume = assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), selection());
  await page.route("**/api/generate-resume", async (route) => {
    generationCalls++;
    const body = route.request().postDataJSON();
    expect(body.profile.status).toBe("verified");
    expect(body.settings.template).toBe("classic");
    expect(body.settings.emphasis).toBe("balanced");
    expect(body.settings.additionalInstructions).toBe("");
    expect(body.settings.targetLength).toBe("one-page");
    await route.fulfill({ json: { success: true, data: { resume: { ...resume, settings: body.settings } } } });
  });
  await page.route("**/api/validate-resume", async (route) => {
    reviewCalls++;
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { success: true, data: { resume: { ...body.resume, validation: body.resume.summary.includes("Led an engineering team") ? { status: "failed", checkedAt: new Date().toISOString(), issues: [{ id: "issue", severity: "error", fieldPath: "summary", message: "Leadership is not supported by the approved evidence.", evidenceIds: [] }] } : { status: "passed", checkedAt: new Date().toISOString(), issues: [] } } } } });
  });
  await page.goto("/dashboard");
  await page.getByLabel("Job description", { exact: true }).fill("Seeking a React engineer to integrate REST APIs and build accessible applications.");
  await expect(page.getByLabel("Emphasis", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Additional instructions", { exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "Modern", exact: true }).focus();
  await page.getByRole("radio", { name: "Modern", exact: true }).press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Classic", exact: true })).toBeChecked();
  await page.getByLabel("Target length", { exact: true }).selectOption("one-page");
  await page.getByRole("button", { name: "Generate Tailored Resume" }).click();
  await expect(page.getByRole("heading", { name: "Resume saved locally" })).toBeVisible();
  expect(analysisCalls).toBe(0); expect(generationCalls).toBe(1);
  await expect(page.getByText("Factual review: passed", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Open saved resume" }).click();
  await expect(page).toHaveURL(new RegExp(`/resume/${resume.id}$`));
  await expect(page.getByRole("article", { name: "Saved resume" })).toContainText("Integrated REST APIs into React applications.");
  await expect(page.getByRole("region", { name: "Factual validation" })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Saved resume" })).toHaveAttribute("data-layout", "classic");
  const previewBounds = await page.getByRole("article", { name: "Saved resume" }).boundingBox();
  expect(previewBounds!.y).toBeLessThan(page.viewportSize()!.height - 100);
  const layoutControl = page.getByRole("button", { name: "Change resume layout", exact: true });
  if (await layoutControl.isVisible()) await layoutControl.click();
  await page.getByText("Compact", { exact: true }).click();
  await expect(page.getByRole("article", { name: "Saved resume" })).toHaveAttribute("data-layout", "compact");
  await expect(page.getByRole("region", { name: "Factual validation" })).toHaveCount(0);
  expect(generationCalls).toBe(1); expect(reviewCalls).toBe(1);
  await page.reload();
  if (await layoutControl.isVisible()) {
    await expect(layoutControl).toContainText("Compact");
    await layoutControl.click();
  }
  await expect(page.getByRole("radio", { name: "Compact", exact: true })).toBeChecked();
  await expect(page.getByRole("article", { name: "Saved resume" })).toHaveAttribute("data-layout", "compact");
  await expect(page.getByRole("article", { name: "Saved resume" })).toContainText("Example Co");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Edit resume", exact: true }).click();
  await expect(page.getByRole("article", { name: "Saved resume" })).toHaveCount(0);
  await page.getByLabel("Professional summary", { exact: true }).fill("An edit to discard.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Professional summary", { exact: true })).toHaveText("An edit to discard.");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("article", { name: "Saved resume" })).not.toContainText("An edit to discard.");
  await expect(page.getByRole("heading", { name: "Preview", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Edit resume", exact: true }).click();
  await page.getByLabel("Professional summary", { exact: true }).fill("Led an engineering team.");
  await expect(page.getByRole("button", { name: /Check facts|Recheck facts/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status", { name: "Resume save status" })).toContainText("Changes saved locally");
  await page.reload();
  await expect(page.getByRole("article", { name: "Saved resume" })).toContainText("Led an engineering team.");
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  expect(reviewCalls).toBe(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "More resume actions", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Restore generated version/ }).click();
  await expect(page.getByRole("article", { name: "Saved resume" })).toContainText(input.profile.summary);
  await expect(page.getByRole("button", { name: /Check facts|Recheck facts/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Return to dashboard", exact: true }).click();
  const history = page.getByRole("region", { name: "Resume history" });
  await expect(history.getByRole("heading", { name: "Frontend Engineer" })).toBeVisible();
  const download = page.waitForEvent("download");
  await history.getByRole("button", { name: "Download JSON", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  page.once("dialog", (dialog) => dialog.dismiss());
  await history.getByRole("button", { name: "Delete resume", exact: true }).click();
  await expect(history.getByRole("link", { name: "Open resume" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await history.getByRole("button", { name: "Delete resume", exact: true }).click();
  await expect(history.getByText("No saved resumes yet.")).toBeVisible();
});

test("combined writing failure preserves input and allows a new attempt", async ({ page }) => {
  await seedApprovedProfile(page);
  let calls = 0;
  await page.route("**/api/generate-resume", async (route) => {
    calls++;
    await route.fulfill({ status: 502, json: { success: false, error: { code: "AI_UNAVAILABLE", message: "AI is temporarily unavailable. Try again." } } });
  });
  await page.goto("/dashboard");
  const description = "Seeking a React engineer to integrate REST APIs.";
  await page.getByLabel("Job description", { exact: true }).fill(description);
  await page.getByRole("button", { name: "Generate Tailored Resume" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("AI is temporarily unavailable. Try again.");
  await expect(page.getByLabel("Job description", { exact: true })).toHaveValue(description);
  await page.getByRole("button", { name: "Generate Tailored Resume" }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.getByRole("heading", { name: "Resume saved locally" })).toHaveCount(0);
});

test("preserves unresolved drafts in history and blocks export", async ({ page }) => {
  const input = await seedApprovedProfile(page);
  const resume = assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), selection());
  await page.route("**/api/analyze-job", (route) => route.fulfill({ json: { success: true, data: { jobAnalysis: input.jobAnalysis } } }));
  await page.route("**/api/generate-resume", (route) => route.fulfill({ json: { success: true, data: { resume } } }));
  await page.route("**/api/validate-resume", (route) => route.fulfill({ json: { success: true, data: { resume: { ...resume, validation: { status: "failed", checkedAt: new Date().toISOString(), correctionAttempted: true, issues: [{ id: "issue", severity: "error", fieldPath: "summary", message: "Unsupported leadership claim.", evidenceIds: [] }] } } } } }));
  await page.goto("/dashboard");
  await page.getByLabel("Job description", { exact: true }).fill("Seeking a React engineer building accessible applications.");
  await page.getByRole("button", { name: "Generate Tailored Resume" }).click();
  await expect(page.getByText("Factual review: failed", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Open saved resume" }).click();
  await expect(page).toHaveURL(new RegExp(`/resume/${resume.id}$`));
  await page.reload();
  await expect(page.getByText("AI generation found unsupported claims.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();
});

test("retries incomplete generation checks without regenerating, then recovers after reload", async ({ page }) => {
  const input = await seedApprovedProfile(page);
  const resume = assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), selection());
  let writes = 0; let reviews = 0;
  await page.route("**/api/generate-resume", async (route) => { writes++; await route.fulfill({ json: { success: true, data: { resume, reviewPermit: "reserved" } } }); });
  await page.route("**/api/validate-resume", async (route) => {
    reviews++;
    expect(route.request().postDataJSON().reviewPermit).toBe("reserved");
    if (reviews === 1) return route.fulfill({ status: 503, json: { success: false, error: { code: "AI_UNAVAILABLE", message: "Review is temporarily unavailable." } } });
    await route.fulfill({ json: { success: true, data: { resume: { ...route.request().postDataJSON().resume, validation: { status: "passed", checkedAt: new Date().toISOString(), issues: [] } } } } });
  });
  await page.goto("/dashboard");
  await page.getByLabel("Job description", { exact: true }).fill("Seeking a React engineer building accessible applications.");
  await page.getByRole("button", { name: "Generate Tailored Resume" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Review is temporarily unavailable");
  await page.getByRole("button", { name: "Retry factual review", exact: true }).click();
  await expect(page.getByText("Factual review: passed", { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Open resume", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Check facts|Recheck facts/ })).toHaveCount(0);
  expect(writes).toBe(1); expect(reviews).toBe(2);
});

test("saves advisory quality warnings, logs their reasons and allows export after factual review", async ({ page }) => {
  const input = await seedApprovedProfile(page);
  const warning = "The draft has only 1 distinct bullets despite enough source material for at least 5.";
  const resume = { ...assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), selection()), qualityWarnings: [warning] };
  let writes = 0; let reviews = 0; const messages: string[] = [];
  page.on("console", (message) => messages.push(message.text()));
  await page.route("**/api/generate-resume", async (route) => { writes++; await route.fulfill({ json: { success: true, data: { resume } } }); });
  await page.route("**/api/validate-resume", async (route) => {
    reviews++;
    await route.fulfill({ json: { success: true, data: { resume: { ...route.request().postDataJSON().resume, validation: { status: "passed", checkedAt: new Date().toISOString(), issues: [] } } } } });
  });
  await page.goto("/dashboard");
  await page.getByLabel("Job description", { exact: true }).fill("Seeking a React engineer building accessible applications.");
  await page.getByRole("button", { name: "Generate Tailored Resume" }).click();
  await expect(page.getByText("Factual review: passed", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "Resume quality warnings" })).toContainText(warning);
  expect(messages.some((message) => message.includes("[Gemini] Resume quality warnings"))).toBe(true);
  await page.getByRole("link", { name: "Open saved resume" }).click();
  await expect(page).toHaveURL(new RegExp(`/resume/${resume.id}$`));
  await page.reload();
  await page.getByText("Quality suggestions (1)", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Resume quality warnings" })).toContainText(warning);
  await expect(page.getByRole("region", { name: "Factual validation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Download Word", exact: true })).toBeEnabled();
  expect(writes).toBe(1); expect(reviews).toBe(1);
});


test("edits resume text in place with stable caret, plain paste, multiline bullets and dates", async ({ page }, testInfo) => {
  const input = tailoringInput();
  input.profile.education = [{ id: "education-inline", institution: "Example University", degree: "Bachelor of Science", fieldOfStudy: "Computer Science", startDate: "2018-09", graduationDate: "2022-05", honors: [], relevantCoursework: [] }];
  await seedApprovedProfile(page, input);
  const resume = assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), { ...selection(), educationIds: ["education-inline"] });
  let reviewCalls = 0;
  await page.route("**/api/generate-resume", (route) => route.fulfill({ json: { success: true, data: { resume } } }));
  await page.route("**/api/validate-resume", async (route) => {
    reviewCalls++;
    await route.fulfill({ json: { success: true, data: { resume: { ...route.request().postDataJSON().resume, validation: { status: "passed", checkedAt: new Date().toISOString(), issues: [] } } } } });
  });
  await page.goto("/dashboard");
  await page.getByLabel("Job description", { exact: true }).fill("Seeking a React engineer integrating REST APIs.");
  await page.getByRole("button", { name: "Generate Tailored Resume", exact: true }).click();
  await page.getByRole("link", { name: "Open saved resume", exact: true }).click();
  await page.getByRole("button", { name: "Edit resume", exact: true }).click();
  await expect(page.getByRole("article", { name: "Editable resume", exact: true })).toBeVisible();
  const summary = page.getByRole("textbox", { name: "Professional summary", exact: true });
  await summary.fill("Builds React apps.");
  await summary.evaluate((node) => {
    node.focus(); const range = document.createRange(); range.setStart(node.firstChild!, 7); range.collapse(true);
    const selected = window.getSelection()!; selected.removeAllRanges(); selected.addRange(range);
  });
  await page.keyboard.type("accessible ");
  await expect(summary).toHaveText("Builds accessible React apps.");
  await summary.evaluate((node) => {
    node.focus(); const range = document.createRange(); range.selectNodeContents(node);
    const selected = window.getSelection()!; selected.removeAllRanges(); selected.addRange(range);
    const clipboard = new DataTransfer(); clipboard.setData("text/plain", "Refined React interfaces."); clipboard.setData("text/html", '<b>Refined React interfaces.</b><img src="x" onerror="window.inlinePasteInjected=true">');
    node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
  await expect(summary).toHaveText("Refined React interfaces.");
  await expect(summary.locator("b, img")).toHaveCount(0);
  await summary.press("ControlOrMeta+z");
  await expect(summary).toHaveText("Builds accessible React apps.");
  await summary.press("ControlOrMeta+Shift+z");
  await expect(summary).toHaveText("Refined React interfaces.");
  const bullet = page.getByRole("textbox", { name: "Employment 1: Bullet 1", exact: true });
  await bullet.fill("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert", { name: "Resume error", exact: true })).toContainText("Add text before saving.");
  await expect(bullet).toBeFocused();
  await bullet.fill("Integrated REST APIs."); await bullet.press("End"); await bullet.press("Enter"); await page.keyboard.type("Maintained React interfaces.");
  await expect(bullet).toHaveText("Integrated REST APIs.\nMaintained React interfaces.");
  const graduation = page.getByRole("textbox", { name: "Education 1: Graduation Date", exact: true });
  await graduation.fill("June 2022"); await graduation.press("Tab");
  await expect(graduation).toHaveText("Jun 2022");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("in-place-editor.png"), fullPage: true });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("article", { name: "Saved resume", exact: true })).toContainText("Refined React interfaces.");
  await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeEnabled();
  expect(reviewCalls).toBe(1);
  const record = await page.evaluate(async (id) => new Promise<{ content: typeof resume; originalContent: typeof resume }>((resolve, reject) => {
    const open = indexedDB.open("ai-resume-tailor"); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result; const tx = db.transaction("generatedResumes"); const read = tx.objectStore("generatedResumes").get(id); tx.oncomplete = () => { db.close(); resolve(read.result); }; tx.onerror = () => reject(tx.error); };
  }), resume.id);
  expect(record.content.education[0].graduationDate).toBe("2022-06");
  expect(record.content.experience[0].bullets[0]).toEqual({ ...resume.experience[0].bullets[0], text: "Integrated REST APIs.\nMaintained React interfaces." });
  expect(record.originalContent.summary).toBe(resume.summary);
  await page.reload(); await page.getByRole("button", { name: "Edit resume", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Professional summary", exact: true })).toHaveText("Refined React interfaces.");
  await expect(page.getByRole("textbox", { name: "Education 1: Graduation Date", exact: true })).toHaveText("Jun 2022");
});
