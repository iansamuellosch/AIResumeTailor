import type { ResumeTemplate } from "@/schemas/resume-template";

export const resumeTemplates = {
  "modern-professional": { name: "Modern", description: "Clean headings and subtle dividers.", margin: 48, lineHeight: 1.4, fontAsset: "NotoSans", cssFont: '"Resume Sans", Arial, sans-serif', wordFont: "Arial", centeredHeader: false, sectionRules: true },
  classic: { name: "Classic", description: "Traditional type with a centered header.", margin: 54, lineHeight: 1.35, fontAsset: "NotoSerif", cssFont: '"Resume Serif", Georgia, serif', wordFont: "Times New Roman", centeredHeader: true, sectionRules: false },
  compact: { name: "Compact", description: "Tighter spacing for more experience.", margin: 42, lineHeight: 1.25, fontAsset: "NotoSans", cssFont: '"Resume Sans", Arial, sans-serif', wordFont: "Arial", centeredHeader: false, sectionRules: false },
} as const satisfies Record<ResumeTemplate, object>;

const baseStyles = {
  name: { size: 21, bold: true, before: 0, after: 5 },
  contact: { size: 9.5, bold: false, before: 0, after: 4 },
  headline: { size: 11, bold: true, before: 5, after: 4 },
  section: { size: 11.5, bold: true, before: 13, after: 6 },
  entry: { size: 10.5, bold: true, before: 6, after: 3 },
  meta: { size: 9.5, bold: false, before: 0, after: 4 },
  text: { size: 10.5, bold: false, before: 0, after: 5 },
  bullet: { size: 10.5, bold: false, before: 0, after: 3 },
};
export type ResumeBlockKind = keyof typeof baseStyles;
export function blockStyle(kind: ResumeBlockKind, template: ResumeTemplate = "modern-professional") {
  const layout = resumeTemplates[template];
  const base = baseStyles[kind];
  return {
    ...base,
    size: template === "compact" ? (kind === "name" ? 18 : Math.max(9, base.size - 0.5)) : template === "classic" && kind === "name" ? 22 : base.size,
    before: template === "compact" ? base.before * 0.65 : base.before,
    after: template === "compact" ? base.after * 0.7 : base.after,
    center: layout.centeredHeader && ["name", "contact", "headline"].includes(kind),
    rule: layout.sectionRules && kind === "section",
  };
}
