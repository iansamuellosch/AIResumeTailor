import { Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, AlignmentType, BorderStyle } from "docx";
import { resumeTemplates } from "@/lib/resume/templates";
import { assertExportable, resumeBlocks, blockStyle } from "./document";
export async function createResumeDocx(input: unknown): Promise<Uint8Array> {
  const resume = assertExportable(input);
  const layout = resumeTemplates[resume.settings.template];
  const children = resumeBlocks(resume).map((block) => {
    const style = blockStyle(block.kind, resume.settings.template);
    return new Paragraph({
      heading: block.kind === "name" ? HeadingLevel.TITLE : block.kind === "section" ? HeadingLevel.HEADING_1 : block.kind === "entry" ? HeadingLevel.HEADING_2 : undefined,
      children: block.text.split("\n").flatMap((line, index) => [new TextRun({ text: line, break: index ? 1 : undefined, bold: style.bold, size: style.size * 2, font: layout.wordFont, color: "141414" })]),
      alignment: style.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      border: style.rule ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: "B8C2CC", space: 3 } } : undefined,
      numbering: block.kind === "bullet" ? { reference: "resume-bullets", level: 0 } : undefined,
      spacing: { before: Math.round(style.before * 20), after: Math.round(style.after * 20), line: Math.round(240 * layout.lineHeight) },
      keepNext: block.keepNext, widowControl: true,
    });
  });
  const doc = new Document({
    creator: "", lastModifiedBy: "", title: `${resume.contact.fullName} Resume`, description: "", revision: 1,
    styles: { default: { document: { run: { font: layout.wordFont, size: blockStyle("text", resume.settings.template).size * 2, color: "141414" } } }, paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { font: layout.wordFont, size: blockStyle("name", resume.settings.template).size * 2, bold: true, color: "141414" }, paragraph: { keepNext: true } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { font: layout.wordFont, size: blockStyle("section", resume.settings.template).size * 2, bold: true, color: "141414" }, paragraph: { keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { font: layout.wordFont, size: blockStyle("entry", resume.settings.template).size * 2, bold: true, color: "141414" }, paragraph: { keepNext: true } },
    ] },
    numbering: { config: [{ reference: "resume-bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "-", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 240, hanging: 240 } } } }] }] },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: layout.margin * 20, bottom: layout.margin * 20, left: layout.margin * 20, right: layout.margin * 20 } } }, children }],
  });
  return Packer.toArrayBuffer(doc).then((buffer) => new Uint8Array(buffer));
}
