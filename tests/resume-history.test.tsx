import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/storage/database", async (original) => ({ ...await original<typeof import("@/lib/storage/database")>(), getDatabase: vi.fn() }));
import { ResumeHistory } from "@/components/dashboard/resume-history";
import { ResumeDatabase, getDatabase } from "@/lib/storage/database";
import { saveGeneratedResume } from "@/lib/storage/resumes";
import { savedResume } from "./fixtures/tailoring";
let db: ResumeDatabase;
beforeEach(() => { db = new ResumeDatabase(`history-${crypto.randomUUID()}`); vi.mocked(getDatabase).mockReturnValue(db); });
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });

it("hides empty history, shows new saves, and disappears when the last resume is deleted", async () => {
  const reads = vi.spyOn(db.generatedResumes, "orderBy");
  const view = render(<ResumeHistory />);
  expect(view.container).toBeEmptyDOMElement();
  await waitFor(() => expect(reads).toHaveBeenCalled());
  const resume = savedResume(); await saveGeneratedResume(db, resume);
  expect(await screen.findByRole("region", { name: "Resume history" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Open resume" })).toHaveAttribute("href", `/resume/${resume.id}`);
  await db.generatedResumes.delete(resume.id);
  await waitFor(() => expect(screen.queryByRole("region", { name: "Resume history" })).not.toBeInTheDocument());
});
it("shows a read failure even when no history could be loaded", async () => {
  vi.spyOn(db.generatedResumes, "orderBy").mockImplementation(() => { throw new Error("Read failed"); });
  render(<ResumeHistory />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not read resume history. Your saved data has been preserved.");
});
it("shows unreadable records instead of treating them as an empty history", async () => {
  const resume = savedResume();
  await db.generatedResumes.add({ id: resume.id, updatedAt: resume.updatedAt, content: { ...resume, profileVersion: 0 }, originalContent: resume });
  render(<ResumeHistory />);
  expect(await screen.findByRole("alert")).toHaveTextContent("1 saved record(s) could not be read and have been preserved.");
  expect(await db.generatedResumes.count()).toBe(1);
});
