import { generatedResumeSchema, type GeneratedResume } from "@/schemas/resume";
export type ExportFormat = "pdf" | "docx";
export interface ResumeBlock { kind: "name" | "contact" | "headline" | "section" | "entry" | "meta" | "text" | "bullet"; text: string; keepNext?: boolean }
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
/** Shared plain-text content for preview, PDF, and DOCX. No notes, evidence IDs, AI messages, or source snapshots. */
export function resumeBlocks(resume: GeneratedResume): ResumeBlock[] {
  const blocks: ResumeBlock[] = [];
  function add(kind: ResumeBlock["kind"], text: string | undefined, keepNext = false) { if (text?.trim()) blocks.push({ kind, text: text.trim().replace(/\r\n?/g, "\n").replace(/\t/g, "    "), keepNext }); }
  const join = (items: (string | undefined)[]) => items.filter(Boolean).join(" | ");
  const dates = (start?: string, end?: string) => [formatMonth(start), formatMonth(end)].filter(Boolean).join(" - ");
  add("name", resume.contact.fullName, true);
  add("contact", join([resume.contact.email, resume.contact.phone, join([resume.contact.city, resume.contact.region, resume.contact.country])]), true);
  add("contact", join([resume.contact.linkedInUrl, resume.contact.portfolioUrl, resume.contact.githubUrl, ...resume.contact.additionalWebsites.map((site) => site.url)]));
  add("headline", resume.headline);
  if (resume.summary) { add("section", "Professional summary", true); add("text", resume.summary); }
  if (resume.experience.length) {
    add("section", "Experience", true);
    resume.experience.forEach((entry) => {
      add("entry", join([entry.jobTitle, entry.employer]), true);
      add("meta", join([entry.location, entry.currentlyEmployed ? [formatMonth(entry.startDate), "Present"].filter(Boolean).join(" - ") : dates(entry.startDate, entry.endDate)]), !!entry.bullets.length);
      entry.bullets.forEach((bullet) => add("bullet", bullet.text));
    });
  }
  if (resume.skills.length) { add("section", "Skills", true); add("text", resume.skills.map((skill) => skill.name).join(", ")); }
  if (resume.projects.length) {
    add("section", "Projects", true);
    resume.projects.forEach((entry) => {
      add("entry", join([entry.name, entry.role]), true);
      add("meta", dates(entry.startDate, entry.endDate), true);
      add("text", entry.description);
      add("text", join([entry.projectUrl, entry.repositoryUrl]));
      entry.bullets.forEach((bullet) => add("bullet", bullet.text));
    });
  }
  if (resume.education.length) {
    add("section", "Education", true);
    resume.education.forEach((entry) => {
      add("entry", entry.institution, true); add("text", join([entry.degree, entry.fieldOfStudy, dates(entry.startDate, entry.graduationDate)]));
      if (entry.gpa) add("text", `GPA: ${entry.gpa}`);
      entry.honors.forEach((fact) => add("text", fact.text));
      if (entry.relevantCoursework.length) add("text", `Coursework: ${entry.relevantCoursework.map((fact) => fact.text).join(", ")}`);
    });
  }
  if (resume.certifications.length) {
    add("section", "Certifications", true);
    resume.certifications.forEach((entry) => {
      add("entry", join([entry.name, entry.issuingOrganization]), true);
      add("text", join([formatMonth(entry.issueDate), entry.expirationDate ? `Expires ${formatMonth(entry.expirationDate)}` : "", entry.credentialUrl]));
    });
  }
  if (blocks.reduce((total, block) => total + block.text.length, 0) > 200_000) throw new Error("This resume is too long to export safely. Shorten its content and try again.");
  return blocks;
}
export const blockStyle = (kind: ResumeBlock["kind"]) => ({
  name: { size: 21, bold: true, before: 0, after: 5 },
  contact: { size: 9.5, bold: false, before: 0, after: 4 },
  headline: { size: 11, bold: true, before: 5, after: 4 },
  section: { size: 11.5, bold: true, before: 13, after: 6 },
  entry: { size: 10.5, bold: true, before: 6, after: 3 },
  meta: { size: 9.5, bold: false, before: 0, after: 4 },
  text: { size: 10.5, bold: false, before: 0, after: 5 },
  bullet: { size: 10.5, bold: false, before: 0, after: 3 },
})[kind];
