import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/storage/database", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/storage/database")>(), getDatabase: vi.fn() }));
vi.mock("@/lib/generation/client", () => ({ requestResumeValidation: vi.fn() }));
import { SavedResume } from "@/components/resume/saved-resume";
import { ResumeDatabase, getDatabase, readProfile, saveProfile } from "@/lib/storage/database";
import { saveGeneratedResume, readResumeRecord, updateGeneratedResume } from "@/lib/storage/resumes";
import { requestResumeValidation } from "@/lib/generation/client";
import { tailoringInput, selection } from "./fixtures/tailoring";
import { assembleResume } from "@/lib/generation/assemble";
import { selectEvidence } from "@/lib/generation/evidence";
let db: ResumeDatabase;
beforeEach(() => { vi.resetAllMocks(); db = new ResumeDatabase(`editor-${crypto.randomUUID()}`); vi.mocked(getDatabase).mockReturnValue(db); });
afterEach(async () => { await db.delete(); });
async function fixture(snapshot = true) {
  const input = tailoringInput();
  const resume = assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), selection());
  resume.validation = { status: "passed", checkedAt: new Date().toISOString(), issues: [] };
  await saveGeneratedResume(db, resume, snapshot ? input.profile : undefined); await saveProfile(db, input.profile);
  render(<SavedResume id={resume.id} />);
  await screen.findByRole("button", { name: "Edit resume" });
  fireEvent.click(screen.getByRole("button", { name: "Edit resume" }));
  return { input, resume };
}
it("keeps oversized pasted text editable and explains how to correct it before saving", async () => {
  const { resume } = await fixture();
  const summary = screen.getByLabelText("Professional summary", { exact: true });
  const pasted = "x".repeat(210_000);
  fireEvent.input(summary, { target: { textContent: pasted } });
  expect(summary.textContent).toBe(pasted);
  fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
  expect(await screen.findByRole("alert", { name: "Resume error" })).toHaveTextContent("characters or fewer");
  expect(summary).toHaveFocus();
  expect((await readResumeRecord(db, resume.id))?.content.summary).toBe(resume.summary);
});
it("saves owner edits without an AI call or changing the approved profile", async () => {
  const { input, resume } = await fixture();
  const changedProfile = { ...input.profile, version: 2, summary: "A newer profile summary." };
  await saveProfile(db, changedProfile);
  fireEvent.input(screen.getByLabelText("Professional summary", { exact: true }), { target: { textContent: "Develops applications with React." } });
  expect(screen.queryByRole("button", { name: /Check facts|Recheck facts/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Resume text editor" })).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Download Word" })).toBeEnabled();
  expect(requestResumeValidation).not.toHaveBeenCalled();
  expect(await readProfile(db, "verified")).toEqual(changedProfile);
  const record = await readResumeRecord(db, resume.id);
  expect(record?.content.summary).toBe("Develops applications with React.");
  expect(record?.originalContent.summary).toBe(input.profile.summary);
});
it("lets saved owner edits download even when Gemini is unavailable", async () => {
  const { resume } = await fixture();
  vi.mocked(requestResumeValidation).mockRejectedValue(new Error("AI review unavailable."));
  fireEvent.input(screen.getByLabelText("Professional summary", { exact: true }), { target: { textContent: "Owner supplied information." } });
  fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
  await waitFor(() => expect(screen.getByRole("article", { name: "Saved resume" })).toBeVisible());
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Download Word" })).toBeEnabled();
  const record = await readResumeRecord(db, resume.id);
  expect(record?.content.validation).toEqual({ status: "manually-edited", issues: [] });
  expect(record?.originalContent).toEqual(resume);
  expect(requestResumeValidation).not.toHaveBeenCalled();
});
it("blocks stale tab saves without discarding local text", async () => {
  const { resume } = await fixture();
  await updateGeneratedResume(db, { ...resume, summary: "Newer tab's summary." }, resume.updatedAt);
  fireEvent.input(screen.getByLabelText("Professional summary", { exact: true }), { target: { textContent: "Stale tab's edits." } });
  fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
  expect(await screen.findByRole("alert", { name: "Resume error" })).toHaveTextContent("another tab");
  expect(screen.getByLabelText("Professional summary", { exact: true })).toHaveTextContent("Stale tab's edits.");
  expect((await readResumeRecord(db, resume.id))?.content.summary).toBe("Newer tab's summary.");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Reload saved version" }));
  expect(screen.getByLabelText("Professional summary", { exact: true })).toHaveTextContent("Stale tab's edits.");
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Reload saved version" }));
  await waitFor(() => expect(screen.getByRole("article", { name: "Saved resume" })).toHaveTextContent("Newer tab's summary."));
  expect(screen.queryByRole("button", { name: "Reload saved version" })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert", { name: "Resume error" })).not.toBeInTheDocument();
  confirm.mockRestore();
});
it("allows editing a legacy resume without its source snapshot or a new AI check", async () => {
  await fixture(false);
  fireEvent.input(screen.getByLabelText("Professional summary", { exact: true }), { target: { textContent: "Updated by the owner." } });
  fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled());
  expect(requestResumeValidation).not.toHaveBeenCalled();
});
it("saves a layout while preserving unsaved text and its export guard without calling Gemini", async () => {
  const { resume } = await fixture();
  fireEvent.input(screen.getByLabelText("Professional summary", { exact: true }), { target: { textContent: "Unsaved text remains here." } });
  fireEvent.click(screen.getByRole("radio", { name: "Classic" }));
  await waitFor(async () => expect((await readResumeRecord(db, resume.id))?.content.settings.template).toBe("classic"));
  expect(screen.getByLabelText("Professional summary", { exact: true })).toHaveTextContent("Unsaved text remains here.");
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  expect(screen.getByRole("status", { name: "Resume save status" })).toHaveTextContent("Unsaved resume changes");
  const record = await readResumeRecord(db, resume.id);
  expect(record?.content.summary).toBe(resume.summary);
  expect(record?.content.validation).toEqual(resume.validation);
  expect(requestResumeValidation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
  await waitFor(() => expect(screen.getByRole("status", { name: "Resume save status" })).toHaveTextContent("Changes saved locally"));
  const saved = await readResumeRecord(db, resume.id);
  expect(saved?.content.summary).toBe("Unsaved text remains here.");
  expect(saved?.content.settings.template).toBe("classic");
  expect(saved?.content.validation.status).toBe("manually-edited");
});

it("cancel confirms before discarding text, keeps the saved layout, and restores the preview", async () => {
  const { resume } = await fixture();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.input(screen.getByLabelText("Professional summary", { exact: true }), { target: { textContent: "Unsaved edit." } });
  fireEvent.click(screen.getByRole("radio", { name: "Compact" }));
  await waitFor(async () => expect((await readResumeRecord(db, resume.id))?.content.settings.template).toBe("compact"));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByLabelText("Professional summary", { exact: true })).toHaveTextContent("Unsaved edit.");
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("region", { name: "Resume text editor" })).not.toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Saved resume" })).toHaveTextContent(resume.summary);
  expect(screen.getByRole("radio", { name: "Compact" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  confirm.mockRestore();
});
it("stays in the editor after a failed save and returns to preview after retry", async () => {
  const { resume } = await fixture();
  vi.spyOn(db.generatedResumes, "put").mockRejectedValueOnce(new Error("Save failed"));
  fireEvent.input(screen.getByLabelText("Professional summary", { exact: true }), { target: { textContent: "Keep this text." } });
  fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
  expect(await screen.findByRole("alert", { name: "Resume error" })).toBeVisible();
  expect(screen.getByLabelText("Professional summary", { exact: true })).toHaveTextContent("Keep this text.");
  expect(screen.queryByRole("article", { name: "Saved resume" })).not.toBeInTheDocument();
  expect((await readResumeRecord(db, resume.id))?.content.summary).toBe(resume.summary);
  expect(screen.queryByRole("button", { name: "Reload saved version" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Resume text editor" })).not.toBeInTheDocument());
  expect(screen.getByRole("article", { name: "Saved resume" })).toHaveTextContent("Keep this text.");
});
it("explains empty bullets in plain language and keeps the editor open", async () => {
  await fixture();
  fireEvent.input(screen.getByLabelText("Employment 1: Bullet 1", { exact: true }), { target: { textContent: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
  expect(screen.getByRole("alert", { name: "Resume error" })).toHaveTextContent("Employment 1 · Bullet 1: Add text before saving.");
  expect(screen.getByRole("region", { name: "Resume text editor" })).toBeVisible();
});
it("leaves editing without saving when nothing changed, preserving the previous fact check", async () => {
  const { resume } = await fixture();
  fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
  expect(screen.getByRole("article", { name: "Saved resume" })).toBeVisible();
  expect((await readResumeRecord(db, resume.id))?.content).toEqual(resume);
});

it("retains the saved fact check when in-place text is restored to its saved value", async () => {
  const { resume } = await fixture();
  const summary = screen.getByRole("textbox", { name: "Professional summary" });
  fireEvent.input(summary, { target: { textContent: "A temporary edit." } });
  fireEvent.input(summary, { target: { textContent: resume.summary } });
  expect(screen.getByRole("button", { name: "Save edits" })).toBeEnabled();
  expect(screen.queryByRole("region", { name: "Factual validation" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
  expect((await readResumeRecord(db, resume.id))?.content).toEqual(resume);
  expect(requestResumeValidation).not.toHaveBeenCalled();
});

it("offers reload for a layout conflict and preserves it while text is edited", async () => {
  const { resume } = await fixture();
  expect(screen.queryByRole("button", { name: "Reload saved version" })).not.toBeInTheDocument();
  await updateGeneratedResume(db, { ...resume, summary: "Updated elsewhere." }, resume.updatedAt);
  fireEvent.click(screen.getByRole("radio", { name: "Classic" }));
  expect(await screen.findByRole("button", { name: "Reload saved version" })).toBeEnabled();
  fireEvent.input(screen.getByLabelText("Professional summary", { exact: true }), { target: { textContent: "Still editing locally." } });
  expect(screen.getByRole("button", { name: "Reload saved version" })).toBeEnabled();
  expect(screen.getByRole("alert", { name: "Resume error" })).toHaveTextContent("out of date");
});
it("keeps local edits if the conflicting resume was deleted or reloading fails", async () => {
  const { resume } = await fixture();
  await db.generatedResumes.delete(resume.id);
  fireEvent.input(screen.getByLabelText("Professional summary", { exact: true }), { target: { textContent: "Keep this local copy." } });
  fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
  const reload = await screen.findByRole("button", { name: "Reload saved version" });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(reload);
  await waitFor(() => expect(screen.getByRole("alert", { name: "Resume error" })).toHaveTextContent("no longer saved"));
  expect(screen.getByLabelText("Professional summary", { exact: true })).toHaveTextContent("Keep this local copy.");
  expect(await db.generatedResumes.count()).toBe(0);
  expect(screen.getByRole("button", { name: "Reload saved version" })).toBeEnabled();
  confirm.mockRestore();
});
