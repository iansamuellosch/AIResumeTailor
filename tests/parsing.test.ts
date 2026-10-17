import { describe, expect, it } from "vitest";
import { createEmptyProfile } from "@/schemas/profile";
import { extractedDataToDraft, parseResumeRequestSchema } from "@/schemas/parse-resume";
import { normalizeExtractedText, validateResumeFile, validateDocxArchive } from "@/lib/parsing/files";
import { MAX_FILE_BYTES } from "@/lib/parsing/limits";

describe("file and text validation", () => {
  it("accepts PDF/DOCX with missing MIME and rejects oversized, empty, or unsupported files", () => {
    expect(validateResumeFile({ name: "Resume.PDF", size: 100, type: "" })).toBe("pdf");
    expect(validateResumeFile({ name: "resume.docx", size: MAX_FILE_BYTES, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })).toBe("docx");
    for (const file of [{ name: "resume.txt", size: 10, type: "text/plain" }, { name: "resume.pdf", size: 0, type: "" }, { name: "resume.pdf", size: MAX_FILE_BYTES + 1, type: "" }, { name: "resume.pdf", size: 10, type: "text/html" }]) expect(() => validateResumeFile(file)).toThrow();
  });
  it("normalizes text without silently truncating large or unreadable documents", () => {
    expect(normalizeExtractedText("  Alex Doe\r\nSoftware Engineer\u0000  ")).toBe("Alex Doe\nSoftware Engineer");
    expect(() => normalizeExtractedText(" ")).toThrow("No readable resume text");
    expect(() => normalizeExtractedText("x".repeat(60001))).toThrow("too much text");
    expect(parseResumeRequestSchema.safeParse({ text: "x".repeat(60001) }).success).toBe(false);
  });
  it("rejects corrupt and oversized DOCX archives before decompression", () => {
    expect(() => validateDocxArchive(new ArrayBuffer(2))).toThrow();
    const data = new ArrayBuffer(100);
    const view = new DataView(data);
    view.setUint32(0, 0x04034b50, true);
    view.setUint32(78, 0x06054b50, true);
    view.setUint16(88, 1, true);
    view.setUint32(94, 4, true);
    view.setUint32(4, 0x02014b50, true);
    view.setUint32(28, 21 * 1024 * 1024, true);
    expect(() => validateDocxArchive(data)).toThrow("expands beyond");
  });
});
describe("extracted drafts", () => {
  it("ignores AI metadata and replaces all fact IDs with unique application IDs", () => {
    const input = createEmptyProfile();
    input.personalInfo.fullName = "Alex Doe";
    input.skills = [{ id: "same", name: "React", category: "frameworks-libraries" }, { id: "same", name: "TypeScript", category: "programming-languages" }];
    const draft = extractedDataToDraft({ ...input, status: "verified", verifiedAt: input.updatedAt });
    expect(draft.status).toBe("draft");
    expect(draft.verifiedAt).toBeUndefined();
    expect(draft.id).not.toBe(input.id);
    expect(new Set(draft.skills.map((skill) => skill.id)).size).toBe(2);
    expect(draft.skills[0].proficiency).toBeUndefined();
  });
  it("rejects empty results and invalid structured information", () => {
    expect(() => extractedDataToDraft(createEmptyProfile())).toThrow("No professional information");
    expect(() => extractedDataToDraft({ skills: "React" })).toThrow();
    const invalid = createEmptyProfile();
    invalid.personalInfo.fullName = "Alex";
    invalid.personalInfo.email = "invalid";
    expect(() => extractedDataToDraft(invalid)).toThrow();
  });
});
