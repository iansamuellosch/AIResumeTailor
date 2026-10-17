// @vitest-environment node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import mammoth from "mammoth";
import { createResumePdf, wrapText } from "@/lib/export/pdf";
import { createResumeDocx } from "@/lib/export/docx";
import { exportFilename, resumeBlocks, assertExportable } from "@/lib/export/document";
import { exportFixture } from "./fixtures/export";
const fonts = async () => ({ regular: new Uint8Array(await readFile("public/fonts/NotoSans-Regular.ttf")), bold: new Uint8Array(await readFile("public/fonts/NotoSans-Bold.ttf")) });
describe("text document exports", () => {
  it("builds safe filenames, retaining names and handling missing job details", () => {
    const resume = exportFixture(); expect(exportFilename(resume, "pdf")).toBe("Alex_Morgan_Example_Company_Frontend_Engineer.pdf");
    resume.contact.fullName = 'José / Doe <>:"\\|?*\u0000'; resume.jobAnalysis.company = "../../Acme"; resume.jobAnalysis.jobTitle = "";
    expect(exportFilename(resume, "docx")).toBe("José_Doe_Acme.docx");
    resume.contact.fullName = "CON"; resume.jobAnalysis.company = undefined;
    expect(exportFilename(resume, "pdf")).toBe("Resume_CON.pdf");
    resume.contact.fullName = "名".repeat(100); resume.jobAnalysis.company = "会".repeat(100); resume.jobAnalysis.jobTitle = "職".repeat(100);
    expect(new TextEncoder().encode(exportFilename(resume, "docx")).byteLength).toBeLessThan(240);
  });
  it("blocks pending and failed reviews, while exposing warnings for review", () => {
    const resume = exportFixture(); resume.validation = { status: "pending-semantic-review", issues: [] }; expect(() => assertExportable(resume)).toThrow("Check facts");
    resume.validation = { status: "failed", checkedAt: new Date().toISOString(), issues: [{ id: "issue", severity: "error", fieldPath: "summary", message: "Unsupported claim", evidenceIds: [] }] }; expect(() => assertExportable(resume)).toThrow();
    resume.validation.status = "needs-review"; resume.validation.issues[0].severity = "warning"; expect(assertExportable(resume).validation.status).toBe("needs-review");
  });
  it("includes every rendered section but excludes private metadata", () => {
    const resume = exportFixture(); resume.notes = "PRIVATE_NOTES"; resume.settings.additionalInstructions = "PRIVATE_INSTRUCTIONS";
    const blocks = resumeBlocks(resume); const text = blocks.map((block) => block.text).join("\n");
    expect(text).toContain("Computer Science"); expect(text).toContain("Jun 2024"); expect(text).toContain("Community directory");
    expect(text).not.toContain("PRIVATE_"); expect(text).not.toContain("fact-1");
  });
  it("wraps long words and URLs without losing text or overflowing", () => {
    const long = "https://example.test/" + "abcdefgh".repeat(30); const lines = wrapText(long, 24, (value) => value.length);
    expect(lines.join("")).toBe(long); expect(lines.every((line) => line.length <= 24)).toBe(true);
    expect(wrapText("First paragraph\nSecond paragraph", 30, (value) => value.length)).toEqual(["First paragraph", "Second paragraph"]);
  });
  it.each([false, true])("exports PDF and editable DOCX with safe page bounds (long=%s)", async (long) => {
    const resume = exportFixture(long); const pdf = await createResumePdf(resume, await fonts()); const docx = await createResumeDocx(resume);
    const loaded = await PDFDocument.load(pdf.bytes); expect(loaded.getPageCount()).toBe(pdf.pageCount);
    if (long) { expect(pdf.pageCount).toBeGreaterThan(1); expect(pdf.pageCount).toBeLessThanOrEqual(10); } else expect(pdf.pageCount).toBe(1);
    for (const line of pdf.lines) { expect(line.x).toBeGreaterThanOrEqual(48); expect(line.x + line.width).toBeLessThanOrEqual(564.01); expect(line.y).toBeGreaterThanOrEqual(48); expect(line.y + line.size).toBeLessThanOrEqual(744); }
    const raw = await mammoth.extractRawText({ buffer: Buffer.from(docx) });
    expect(raw.value).toContain(resume.contact.fullName); expect(raw.value).toContain("Web Accessibility Certificate"); expect(raw.value).toContain("integrating REST APIs"); expect(raw.value).not.toContain("fact-1");
    if (process.env.EXPORT_QA_DIR) { await mkdir(process.env.EXPORT_QA_DIR, { recursive: true }); const name = long ? "multi-page" : "one-page"; await writeFile(`${process.env.EXPORT_QA_DIR}/${name}.pdf`, pdf.bytes); await writeFile(`${process.env.EXPORT_QA_DIR}/${name}.docx`, docx); }
  });
  it("preserves accented names and reports unsupported PDF characters without silently corrupting text", async () => {
    const resume = exportFixture(); resume.contact.fullName = "José Müller"; expect((await createResumePdf(resume, await fonts())).lines[0].text).toBe("José Müller");
    resume.contact.fullName = "Alex 😀"; await expect(createResumePdf(resume, await fonts())).rejects.toThrow("cannot display");
  });
});
