import { MAX_FILE_BYTES, MAX_TEXT_CHARACTERS } from "./limits";

export type ResumeFormat = "pdf" | "docx";
export function validateResumeFile(file: Pick<File, "name" | "size" | "type">): ResumeFormat {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "pdf" && extension !== "docx") throw new Error("Choose a PDF or DOCX resume.");
  if (file.size === 0) throw new Error("This file is empty. Choose another resume.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Your resume must be 5 MB or smaller.");
  const expected = extension === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (file.type && file.type !== expected && file.type !== "application/octet-stream" && file.type !== "application/zip") {
    throw new Error("The file type does not match its extension. Choose a PDF or DOCX resume.");
  }
  return extension;
}

/** Check ZIP directory sizes before Mammoth decompresses a DOCX. */
export function validateDocxArchive(data: ArrayBuffer): void {
  const view = new DataView(data);
  if (view.byteLength < 22 || view.getUint32(0, true) !== 0x04034b50) throw new Error("This DOCX file is corrupt or unsupported.");
  let end = -1;
  for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65_557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw new Error("This DOCX file is corrupt or unsupported.");
  const count = view.getUint16(end + 10, true);
  const start = view.getUint32(end + 16, true);
  if (count > 1000 || count === 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) throw new Error("This DOCX archive is too complex or unsupported.");
  let offset = start;
  let total = 0;
  let hasDocument = false;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error("This DOCX file is corrupt.");
    if (view.getUint16(offset + 8, true) & 1) throw new Error("Password-protected documents are not supported.");
    total += view.getUint32(offset + 24, true);
    if (total > 20 * 1024 * 1024) throw new Error("This DOCX expands beyond the supported size. Save a smaller copy and try again.");
    const nameLength = view.getUint16(offset + 28, true);
    const next = offset + 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (next > end) throw new Error("This DOCX file is corrupt.");
    const name = new TextDecoder().decode(new Uint8Array(data, offset + 46, nameLength));
    if (name === "word/document.xml") hasDocument = true;
    offset = next;
  }
  if (!hasDocument) throw new Error("This file does not contain a DOCX document.");
}

export function normalizeExtractedText(value: string): string {
  const text = value.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
  if (text.length < 20) throw new Error("No readable resume text was found. Scanned or image-only PDFs need OCR first. Try a text-based PDF, DOCX, or create a draft manually.");
  if (text.length > MAX_TEXT_CHARACTERS) throw new Error("This resume contains too much text. Use a shorter document and try again.");
  return text;
}
