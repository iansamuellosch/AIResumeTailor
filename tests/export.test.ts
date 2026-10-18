// @vitest-environment node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import mammoth from "mammoth";
import { createResumePdf, wrapText } from "@/lib/export/pdf";
import { createResumeDocx } from "@/lib/export/docx";
import { exportFilename, resumeBlocks, assertExportable } from "@/lib/export/document";
import { resumeTemplates, blockStyle } from "@/lib/resume/templates";
import type { ResumeTemplate } from "@/schemas/resume-template";
import { exportFixture } from "./fixtures/export";
const fonts = async (template: ResumeTemplate = "modern-professional") => ({ regular: new Uint8Array(await readFile(`public/fonts/${resumeTemplates[template].fontAsset}-Regular.ttf`)), bold: new Uint8Array(await readFile(`public/fonts/${resumeTemplates[template].fontAsset}-Bold.ttf`)) });
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
    const resume = exportFixture(); resume.validation = { status: "pending-semantic-review", issues: [] }; expect(() => assertExportable(resume)).toThrow("Finish AI generation checks");
    resume.validation = { status: "failed", checkedAt: new Date().toISOString(), issues: [{ id: "issue", severity: "error", fieldPath: "summary", message: "Unsupported claim", evidenceIds: [] }] }; expect(() => assertExportable(resume)).toThrow();
    resume.validation.status = "needs-review"; resume.validation.issues[0].severity = "warning"; expect(assertExportable(resume).validation.status).toBe("needs-review");
  });
  it("permits saved manual edits without claiming they passed AI validation", () => {
    const resume = exportFixture();
    resume.validation = { status: "manually-edited", issues: [] };
    expect(assertExportable(resume).validation).toEqual({ status: "manually-edited", issues: [] });
    expect(() => assertExportable({ ...resume, validation: { ...resume.validation, checkedAt: new Date().toISOString() } })).toThrow();
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
  it.each((Object.keys(resumeTemplates) as ResumeTemplate[]).flatMap((template) => [false, true].map((long) => ({ template, long }))))("exports $template PDF and editable DOCX with safe page bounds (long=$long)", async ({ template, long }) => {
    const resume = exportFixture(long); resume.settings.template = template;
    const margin = resumeTemplates[template].margin;
    const pdf = await createResumePdf(resume, await fonts(template)); const docx = await createResumeDocx(resume);
    const loaded = await PDFDocument.load(pdf.bytes); expect(loaded.getPageCount()).toBe(pdf.pageCount);
    if (long) { expect(pdf.pageCount).toBeGreaterThan(1); expect(pdf.pageCount).toBeLessThanOrEqual(10); } else expect(pdf.pageCount).toBe(1);
    for (const line of pdf.lines) { expect(line.x).toBeGreaterThanOrEqual(margin); expect(line.x + line.width).toBeLessThanOrEqual(612 - margin + 0.01); expect(line.y).toBeGreaterThanOrEqual(margin); expect(line.y + line.size).toBeLessThanOrEqual(792 - margin); }
    expect(pdf.lines[0].size).toBe(blockStyle("name", template).size);
    if (template === "classic") expect(pdf.lines[0].x + pdf.lines[0].width / 2).toBeCloseTo(306, 1);
    else expect(pdf.lines[0].x).toBe(margin);
    const raw = await mammoth.extractRawText({ buffer: Buffer.from(docx) });
    expect(raw.value).toContain(resume.contact.fullName); expect(raw.value).toContain("Web Accessibility Certificate"); expect(raw.value).toContain("integrating REST APIs"); expect(raw.value).not.toContain("fact-1");
    if (process.env.EXPORT_QA_DIR) { await mkdir(process.env.EXPORT_QA_DIR, { recursive: true }); const name = `${template}-${long ? "multi-page" : "one-page"}`; await writeFile(`${process.env.EXPORT_QA_DIR}/${name}.pdf`, pdf.bytes); await writeFile(`${process.env.EXPORT_QA_DIR}/${name}.docx`, docx); }
  });
  it("preserves accented names and reports unsupported PDF characters without silently corrupting text", async () => {
    const resume = exportFixture(); resume.contact.fullName = "José Müller"; expect((await createResumePdf(resume, await fonts())).lines[0].text).toBe("José Müller");
    resume.contact.fullName = "Alex 😀"; await expect(createResumePdf(resume, await fonts())).rejects.toThrow("cannot display");
  });
});
