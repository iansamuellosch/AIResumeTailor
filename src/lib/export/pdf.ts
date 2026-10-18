import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import { resumeTemplates } from "@/lib/resume/templates";
import fontkit from "@pdf-lib/fontkit";
import { assertExportable, resumeBlocks, blockStyle } from "./document";

export interface PdfFonts { regular: Uint8Array; bold: Uint8Array }
export interface PdfLayoutLine { page: number; text: string; x: number; y: number; width: number; size: number }
const PAGE_WIDTH = 612; const PAGE_HEIGHT = 792;
/** Break oversized words/URLs without truncation; preserve explicit paragraph breaks. */
export function wrapText(text: string, width: number, measure: (value: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      if (measure(word) > width) {
        if (line) { lines.push(line); line = ""; }
        const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(word);
        for (const { segment } of segments) {
          if (line && measure(line + segment) > width) { lines.push(line); line = ""; }
          if (measure(segment) > width) throw new Error("A character is too wide for this document.");
          line += segment;
        }
      } else if (!line || measure(`${line} ${word}`) <= width) line = line ? `${line} ${word}` : word;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}
export async function createResumePdf(input: unknown, fonts: PdfFonts): Promise<{ bytes: Uint8Array; pageCount: number; lines: PdfLayoutLine[] }> {
  const resume = assertExportable(input); const blocks = resumeBlocks(resume);
  const template = resumeTemplates[resume.settings.template];
  const MARGIN = template.margin; const BOTTOM = template.margin;
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true }); const bold = await doc.embedFont(fonts.bold, { subset: true });
  const supported = new Set(regular.getCharacterSet()); const supportedBold = new Set(bold.getCharacterSet());
  for (const block of blocks) for (const char of block.text.replace(/\n/g, "")) {
    if (!(blockStyle(block.kind, resume.settings.template).bold ? supportedBold : supported).has(char.codePointAt(0)!)) throw new Error(`The PDF font cannot display “${char}” (U+${char.codePointAt(0)!.toString(16).toUpperCase()}). Use DOCX for this text or replace that character.`);
  }
  const layout = blocks.map((block) => {
    const style = blockStyle(block.kind, resume.settings.template); const font = style.bold ? bold : regular;
    const indent = block.kind === "bullet" ? 12 : 0;
    return { block, style, font, indent, leading: style.size * template.lineHeight, wrapped: wrapText(block.text, PAGE_WIDTH - 2 * MARGIN - indent, (value) => font.widthOfTextAtSize(value, style.size)) };
  });
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]); let top = PAGE_HEIGHT - MARGIN;
  const lines: PdfLayoutLine[] = [];
  function newPage() {
    if (doc.getPageCount() >= 50) throw new Error("This resume exceeds 50 pages. Shorten its content before exporting.");
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]); top = PAGE_HEIGHT - MARGIN;
  }
  function draw(text: string, x: number, y: number, font: PDFFont, size: number) {
    page.drawText(text, { x, y, size, font, color: rgb(0.08, 0.08, 0.08) });
    lines.push({ page: doc.getPageCount(), text, x, y, width: font.widthOfTextAtSize(text, size), size });
  }
  for (let index = 0; index < layout.length; index++) {
    const item = layout[index];
    // Reserve chained headings and at least two lines of the following paragraph.
    if (item.block.keepNext) {
      let needed = 0;
      for (let next = index; next < layout.length; next++) {
        const following = layout[next];
        needed += following.style.before + following.style.after + (following.block.keepNext ? Math.min(3, following.wrapped.length) : Math.min(2, following.wrapped.length)) * following.leading;
        if (!following.block.keepNext) break;
      }
      if (needed <= PAGE_HEIGHT - MARGIN - BOTTOM && top - needed < BOTTOM) newPage();
    }
    if (top < PAGE_HEIGHT - MARGIN) top -= item.style.before;
    let offset = 0;
    while (offset < item.wrapped.length) {
      let capacity = Math.floor((top - BOTTOM) / item.leading);
      const remaining = item.wrapped.length - offset;
      if (capacity < Math.min(2, remaining)) { newPage(); capacity = Math.floor((top - BOTTOM) / item.leading); }
      let count = Math.min(capacity, remaining);
      if (remaining - count === 1) {
        if (count > 2) count--;
        else { newPage(); count = Math.min(Math.floor((top - BOTTOM) / item.leading), remaining); }
      }
      for (const line of item.wrapped.slice(offset, offset + count)) {
        const y = top - item.style.size;
        if (item.block.kind === "bullet" && offset === 0) draw("-", MARGIN, y, regular, item.style.size);
        const x = item.style.center ? (PAGE_WIDTH - item.font.widthOfTextAtSize(line, item.style.size)) / 2 : MARGIN + item.indent;
        draw(line, x, y, item.font, item.style.size);
        top -= item.leading; offset++;
      }
      if (offset < item.wrapped.length) newPage();
    }
    if (item.style.rule) page.drawLine({ start: { x: MARGIN, y: top + 1 }, end: { x: PAGE_WIDTH - MARGIN, y: top + 1 }, thickness: 0.5, color: rgb(0.72, 0.76, 0.8) });
    top -= item.style.after;
  }
  const pageCount = doc.getPageCount();
  doc.getPages().forEach((current, index) => current.drawText(`${index + 1} / ${pageCount}`, { x: PAGE_WIDTH - MARGIN - 28, y: 26, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) }));
  doc.setTitle(`${resume.contact.fullName} Resume`); doc.setCreator("AI Resume Tailor"); doc.setProducer("AI Resume Tailor");
  return { bytes: await doc.save(), pageCount, lines };
}
