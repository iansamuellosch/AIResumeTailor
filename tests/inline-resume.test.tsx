import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InlineResumeText, normalizeInlineDate } from "@/components/resume/inline-resume-text";
import { ResumeEditor } from "@/components/resume/resume-editor";
import { resumeBlocks } from "@/lib/export/document";
import { editableResumeFields } from "@/lib/generation/editing";
import { exportFixture } from "./fixtures/export";

function selectAll(node: HTMLElement) {
  node.focus(); const range = document.createRange(); range.selectNodeContents(node);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
}
function TextHarness({ onChange = () => {}, date = false }: { onChange?: (value: string) => void; date?: boolean }) {
  const [value, setValue] = useState(date ? "2023-04" : "Original text");
  return <InlineResumeText value={value} label="Inline text" multiline={!date} date={date} disabled={false} onChange={(text) => { setValue(text); onChange(text); }} />;
}
describe("in-place resume editing", () => {
  it("maps rendered fields to allowed paths while keeping section titles and separators fixed", () => {
    const resume = exportFixture();
    const fields = new Set(editableResumeFields(resume).map((field) => field.path));
    const parts = resumeBlocks(resume).flatMap((block) => block.parts);
    for (const part of parts) if (part.path) expect(fields.has(part.path)).toBe(true);
    expect(parts.some((part) => part.path?.includes("evidenceIds"))).toBe(false);
    expect(parts.find((part) => part.text === "Experience")?.path).toBeUndefined();
    for (const block of resumeBlocks(resume)) expect(block.parts.map((part) => part.text).join("").trim()).toBe(block.text);
  });
  it("keeps a cleared bullet mounted and retains IDs and evidence while editing compound lines", () => {
    const original = exportFixture(); const changed = vi.fn();
    function Editor() { const [resume, setResume] = useState(original); return <ResumeEditor resume={resume} disabled={false} onChange={(value) => { setResume(value); changed(value); }} />; }
    render(<Editor />);
    fireEvent.input(screen.getByRole("textbox", { name: "Employment 1: Employer" }), { target: { textContent: "Edited company" } });
    const bullet = screen.getByRole("textbox", { name: "Employment 1: Bullet 1" });
    fireEvent.input(bullet, { target: { textContent: "" } });
    expect(screen.getByRole("textbox", { name: "Employment 1: Bullet 1" })).toBe(bullet);
    fireEvent.input(bullet, { target: { textContent: "Revised contribution." } });
    const result = changed.mock.calls.at(-1)![0];
    expect(result.experience[0].employer).toBe("Edited company");
    expect(result.experience[0].jobTitle).toBe(original.experience[0].jobTitle);
    expect(result.experience[0].bullets[0]).toEqual({ ...original.experience[0].bullets[0], text: "Revised contribution." });
    expect(original.experience[0].employer).not.toBe("Edited company");
    expect(result.validation.status).toBe("pending-semantic-review");
  });
  it("pastes only plain text and supports undo/redo for pasted content", () => {
    const changed = vi.fn(); render(<TextHarness onChange={changed} />);
    const box = screen.getByRole("textbox", { name: "Inline text" }); selectAll(box);
    fireEvent.paste(box, { clipboardData: { getData: (type: string) => type === "text/plain" ? "Plain text\nSecond line" : '<img src=x onerror="bad()">' } });
    expect(box.textContent).toBe("Plain text\nSecond line"); expect(box.querySelector("img")).toBeNull();
    expect(changed).toHaveBeenLastCalledWith("Plain text\nSecond line");
    fireEvent.keyDown(box, { key: "z", ctrlKey: true }); expect(box.textContent).toBe("Original text");
    fireEvent.keyDown(box, { key: "z", ctrlKey: true, shiftKey: true }); expect(box.textContent).toBe("Plain text\nSecond line");
  });
  it("waits until IME composition ends before updating the model", () => {
    const changed = vi.fn(); render(<TextHarness onChange={changed} />);
    const box = screen.getByRole("textbox", { name: "Inline text" }); box.focus();
    fireEvent.compositionStart(box); fireEvent.input(box, { target: { textContent: "こんにちは" } });
    expect(changed).not.toHaveBeenCalled();
    fireEvent.compositionEnd(box); expect(changed).toHaveBeenLastCalledWith("こんにちは");
  });
  it("keeps clicking a formatted date clean and normalizes edited dates on blur", () => {
    const changed = vi.fn(); render(<TextHarness date onChange={changed} />);
    const box = screen.getByRole("textbox", { name: "Inline text" });
    expect(box.textContent).toBe("Apr 2023"); fireEvent.blur(box); expect(changed).not.toHaveBeenCalled();
    box.focus(); fireEvent.input(box, { target: { textContent: "June 2024" } });
    expect(box.textContent).toBe("June 2024"); fireEvent.blur(box);
    expect(changed).toHaveBeenLastCalledWith("2024-06"); expect(box.textContent).toBe("Jun 2024");
    expect(normalizeInlineDate("2024-03")).toBe("2024-03"); expect(normalizeInlineDate("unknown")).toBe("unknown");
  });
});
