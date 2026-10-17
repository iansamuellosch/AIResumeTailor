import { Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, AlignmentType } from "docx";
import { assertExportable, resumeBlocks, blockStyle } from "./document";
export async function createResumeDocx(input: unknown): Promise<Uint8Array> {
  const resume = assertExportable(input);
  const children = resumeBlocks(resume).map((block) => {
    const style = blockStyle(block.kind);
    return new Paragraph({
      heading: block.kind === "name" ? HeadingLevel.TITLE : block.kind === "section" ? HeadingLevel.HEADING_1 : block.kind === "entry" ? HeadingLevel.HEADING_2 : undefined,
      children: block.text.split("\n").flatMap((line, index) => [new TextRun({ text: line, break: index ? 1 : undefined, bold: style.bold, size: style.size * 2, font: "Arial", color: "141414" })]),
      numbering: block.kind === "bullet" ? { reference: "resume-bullets", level: 0 } : undefined,
      spacing: { before: style.before * 20, after: style.after * 20, line: Math.round(240 * 1.4) },
      keepNext: block.keepNext, widowControl: true,
    });
  });
  const doc = new Document({
    creator: "", lastModifiedBy: "", title: `${resume.contact.fullName} Resume`, description: "", revision: 1,
    styles: { default: { document: { run: { font: "Arial", size: 21, color: "141414" } } }, paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { font: "Arial", size: 42, bold: true, color: "141414" }, paragraph: { keepNext: true } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { font: "Arial", size: 23, bold: true, color: "141414" }, paragraph: { keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { font: "Arial", size: 21, bold: true, color: "141414" }, paragraph: { keepNext: true } },
    ] },
    numbering: { config: [{ reference: "resume-bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "-", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 240, hanging: 240 } } } }] }] },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 960, bottom: 960, left: 960, right: 960 } } }, children }],
  });
  return Packer.toArrayBuffer(doc).then((buffer) => new Uint8Array(buffer));
}
