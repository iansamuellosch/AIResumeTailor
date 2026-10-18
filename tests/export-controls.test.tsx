import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/export/client", () => ({ downloadResume: vi.fn() }));
import { downloadResume } from "@/lib/export/client";
import { ExportControls } from "@/components/resume/export-controls";
import { exportFixture } from "./fixtures/export";
beforeEach(() => { vi.resetAllMocks(); });
it("blocks formatted exports while edits are unsaved or facts have not passed review", () => {
  const resume = exportFixture(); const view = render(<ExportControls resume={resume} dirty />);
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  view.rerender(<ExportControls resume={{ ...resume, validation: { status: "pending-semantic-review", issues: [] } }} />);
  expect(screen.getByRole("button", { name: "Download Word" })).toBeDisabled(); expect(downloadResume).not.toHaveBeenCalled();
});
it("offers a retry and leaves the saved resume intact after export failure", async () => {
  const resume = exportFixture(); const before = structuredClone(resume);
  vi.mocked(downloadResume).mockRejectedValueOnce(new Error("PDF fonts unavailable.")).mockResolvedValueOnce({ pageCount: 2 });
  render(<ExportControls resume={resume} />); fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
  expect(await screen.findByRole("alert", { name: "Export error" })).toHaveTextContent("PDF fonts unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
  await screen.findByText("PDF downloaded · 2 page(s)."); expect(resume).toEqual(before); expect(downloadResume).toHaveBeenCalledTimes(2);
});
it("shows validation warnings before export", () => {
  const resume = exportFixture(); resume.validation = { status: "needs-review", checkedAt: new Date().toISOString(), issues: [{ id: "warning", severity: "warning", fieldPath: "summary", message: "Review ambiguous wording.", evidenceIds: [] }] };
  render(<ExportControls resume={resume} />); expect(screen.getByText("Review ambiguous wording.")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
});

it("allows PDF and Word downloads for saved manual edits without an AI review", async () => {
  const resume = { ...exportFixture(), validation: { status: "manually-edited" as const, issues: [] } };
  vi.mocked(downloadResume).mockResolvedValue({ pageCount: 1 });
  render(<ExportControls resume={resume} compact />);
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Download Word" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Download Word" }));
  await screen.findByText(/Editable Word document downloaded/);
  expect(downloadResume).toHaveBeenCalledWith(resume, "docx");
});
