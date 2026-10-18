import { generatedResumeSchema, type GeneratedResume } from "@/schemas/resume";
import type { ResumeBlockKind } from "@/lib/resume/templates";
export { blockStyle } from "@/lib/resume/templates";
export type ExportFormat = "pdf" | "docx";
export interface ResumePart { text: string; path?: string }
export interface ResumeBlock { key: string; kind: ResumeBlockKind; text: string; parts: ResumePart[]; keepNext?: boolean }
export function assertExportable(input: unknown): GeneratedResume {
  const resume = generatedResumeSchema.parse(input);
  if (resume.validation.status === "pending-semantic-review" || resume.validation.status === "failed" || resume.validation.issues.some((issue) => issue.severity === "error")) throw new Error("Check facts and resolve validation errors before exporting this resume.");
  if (!resume.contact.fullName.trim()) throw new Error("Add your name before exporting.");
  return resume;
}
export function exportFilename(resume: GeneratedResume, format: ExportFormat): string {
  const part = (value: string) => {
    const cleaned = value.normalize("NFKC").replace(/[\p{Cc}\p{Cf}<>:"/\\|?*]+/gu, " ").trim().replace(/[\s.]+/g, "_").replace(/^_+|_+$/g, "");
    let result = ""; let bytes = 0;
    for (const char of cleaned) { const size = new TextEncoder().encode(char).length; if (bytes + size > 70) break; result += char; bytes += size; }
    return result.replace(/_+$/g, "");
  };
  const segments = [part(resume.contact.fullName) || "Resume", part(resume.jobAnalysis.company || ""), part(resume.jobAnalysis.jobTitle || "")].filter(Boolean);
  const base = segments.join("_");
  return `${/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:_|$)/i.test(base) ? "Resume_" : ""}${base}.${format}`;
}
export function formatMonth(value?: string): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return match ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(match[2]) - 1] ?? match[2]} ${match[1]}` : value;
}
/** Shared content and field boundaries for preview, in-place editing, PDF, and DOCX.
 * Retained paths keep a cleared field mounted while editing; exports omit blank text.
 * Only text is used in exported documents. Field paths never become document content.
 */
export function resumeBlocks(resume: GeneratedResume, retainedPaths?: ReadonlySet<string>): ResumeBlock[] {
  const blocks: ResumeBlock[] = [];
  type Content = ResumePart[];
  const literal = (text: string): Content => text ? [{ text }] : [];
  function field(path: string, value?: string, format: (value: string) => string = (value) => value): Content {
    return value?.trim() || retainedPaths?.has(path) ? [{ path, text: value ? format(value) : "" }] : [];
  }
  function join(chunks: Content[], separator = " | "): Content {
    return chunks.filter((chunk) => chunk.length).flatMap((chunk, index) => index ? [...literal(separator), ...chunk] : chunk);
  }
  function add(kind: ResumeBlockKind, content: string | Content, keepNext = false) {
    const parts = typeof content === "string" ? literal(content) : content;
    const text = parts.map((part) => part.text).join("").trim().replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
    if (text || parts.some((part) => part.path && retainedPaths?.has(part.path))) blocks.push({ key: parts.find((part) => part.path)?.path ?? `${kind}-${blocks.length}`, kind, text, parts, keepNext });
  }
  const dates = (prefix: string, start: string | undefined, end: string | undefined, endKey = "endDate") => join([field(`${prefix}.startDate`, start, formatMonth), field(`${prefix}.${endKey}`, end, formatMonth)], " - ");
  add("name", field("contact.fullName", resume.contact.fullName), true);
  add("contact", join([field("contact.email", resume.contact.email), field("contact.phone", resume.contact.phone), join([field("contact.city", resume.contact.city), field("contact.region", resume.contact.region), field("contact.country", resume.contact.country)])]), true);
  const linkFields: [string, string | undefined][] = [
    ["contact.linkedInUrl", resume.contact.linkedInUrl], ["contact.portfolioUrl", resume.contact.portfolioUrl], ["contact.githubUrl", resume.contact.githubUrl],
    ...resume.contact.additionalWebsites.map((site, index): [string, string | undefined] => [`contact.additionalWebsites.${index}.url`, site.url]),
  ];
  const seenLinks = new Set<string>();
  add("contact", join(linkFields.filter(([, value]) => {
    if (retainedPaths) return true;
    if (!value || seenLinks.has(value)) return false;
    seenLinks.add(value); return true;
  }).map(([path, value]) => field(path, value))));
  add("headline", field("headline", resume.headline));
  if (resume.summary || retainedPaths?.has("summary")) { add("section", "Professional summary", true); add("text", field("summary", resume.summary)); }
  if (resume.experience.length) {
    add("section", "Experience", true);
    resume.experience.forEach((entry, index) => {
      const path = `experience.${index}`;
      add("entry", join([field(`${path}.jobTitle`, entry.jobTitle), field(`${path}.employer`, entry.employer)]), true);
      add("meta", join([field(`${path}.location`, entry.location), entry.currentlyEmployed ? join([field(`${path}.startDate`, entry.startDate, formatMonth), literal("Present")], " - ") : dates(path, entry.startDate, entry.endDate)]), !!entry.bullets.length);
      entry.bullets.forEach((bullet, i) => add("bullet", field(`${path}.bullets.${i}.text`, bullet.text)));
    });
  }
  if (resume.skills.length) { add("section", "Skills", true); add("text", join(resume.skills.map((skill, index) => field(`skills.${index}.name`, skill.name)), ", ")); }
  if (resume.projects.length) {
    add("section", "Projects", true);
    resume.projects.forEach((entry, index) => {
      const path = `projects.${index}`;
      add("entry", join([field(`${path}.name`, entry.name), field(`${path}.role`, entry.role)]), true);
      add("meta", dates(path, entry.startDate, entry.endDate), true);
      add("text", field(`${path}.description`, entry.description));
      add("text", join([field(`${path}.projectUrl`, entry.projectUrl), field(`${path}.repositoryUrl`, entry.repositoryUrl)]));
      entry.bullets.forEach((bullet, i) => add("bullet", field(`${path}.bullets.${i}.text`, bullet.text)));
    });
  }
  if (resume.education.length) {
    add("section", "Education", true);
    resume.education.forEach((entry, index) => {
      const path = `education.${index}`;
      add("entry", field(`${path}.institution`, entry.institution), true);
      add("text", join([field(`${path}.degree`, entry.degree), field(`${path}.fieldOfStudy`, entry.fieldOfStudy), dates(path, entry.startDate, entry.graduationDate, "graduationDate")]));
      const gpa = field(`${path}.gpa`, entry.gpa); if (gpa.length) add("text", [...literal("GPA: "), ...gpa]);
      entry.honors.forEach((fact, i) => add("text", field(`${path}.honors.${i}.text`, fact.text)));
      if (entry.relevantCoursework.length) add("text", [...literal("Coursework: "), ...join(entry.relevantCoursework.map((fact, i) => field(`${path}.relevantCoursework.${i}.text`, fact.text)), ", ")]);
    });
  }
  if (resume.certifications.length) {
    add("section", "Certifications", true);
    resume.certifications.forEach((entry, index) => {
      const path = `certifications.${index}`;
      add("entry", join([field(`${path}.name`, entry.name), field(`${path}.issuingOrganization`, entry.issuingOrganization)]), true);
      const expiration = field(`${path}.expirationDate`, entry.expirationDate, formatMonth);
      add("text", join([field(`${path}.issueDate`, entry.issueDate, formatMonth), expiration.length ? [...literal("Expires "), ...expiration] : [], field(`${path}.credentialUrl`, entry.credentialUrl)]));
    });
  }
  if (!retainedPaths && blocks.reduce((total, block) => total + block.text.length, 0) > 200_000) throw new Error("This resume is too long to display or export safely. Shorten its content and try again.");
  return blocks;
}
