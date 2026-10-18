import { expect, test, type Page } from "@playwright/test";
import { tailoringInput, selection } from "../tests/fixtures/tailoring";
import { assembleResume } from "../src/lib/generation/assemble";
import { selectEvidence } from "../src/lib/generation/evidence";

async function seedApprovedProfile(page: Page) {
  const input = tailoringInput();
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
  await expect(page.getByRole("heading", { name: "Factual checks completed" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Saved resume" })).toHaveAttribute("data-layout", "classic");
  await page.getByText("Compact", { exact: true }).click();
  await expect(page.getByRole("status", { name: "Resume save status" })).toHaveText("Compact layout saved.");
  await expect(page.getByRole("heading", { name: "Factual checks completed" })).toBeVisible();
  expect(generationCalls).toBe(1); expect(reviewCalls).toBe(1);
  await page.reload();
  await expect(page.getByRole("radio", { name: "Compact", exact: true })).toBeChecked();
  await expect(page.getByRole("article", { name: "Saved resume" })).toHaveAttribute("data-layout", "compact");
  await expect(page.getByRole("article", { name: "Saved resume" })).toContainText("Example Co");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Edit resume", exact: true }).click();
  await page.getByLabel("Professional summary", { exact: true }).fill("Led an engineering team.");
  await expect(page.getByRole("heading", { name: "Changes need factual review" })).toBeVisible();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status", { name: "Resume save status" })).toContainText("Changes saved locally");
  await page.reload();
  await expect(page.getByRole("article", { name: "Saved resume" })).toContainText("Led an engineering team.");
  await page.getByRole("button", { name: "Check facts & save" }).click();
  await expect(page.getByRole("heading", { name: "Unsupported claims require correction" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Factual validation" })).toContainText("Leadership is not supported");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restore original", exact: true }).click();
  await expect(page.getByRole("article", { name: "Saved resume" })).toContainText(input.profile.summary);
  await expect(page.getByRole("heading", { name: "Changes need factual review" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Unsupported claims require correction" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeDisabled();
});

test("recovers a saved pending draft after reload and retries review without regeneration", async ({ page }) => {
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
  await page.reload();
  await page.getByRole("link", { name: "Open resume", exact: true }).click();
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeDisabled();
  await page.getByRole("button", { name: "Check facts & save" }).click();
  await expect(page.getByRole("heading", { name: "Factual checks completed" })).toBeVisible();
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
  await expect(page.getByRole("region", { name: "Resume quality warnings" })).toContainText(warning);
  await expect(page.getByRole("heading", { name: "Factual checks completed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PDF", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Export DOCX", exact: true })).toBeEnabled();
  expect(writes).toBe(1); expect(reviews).toBe(1);
});
