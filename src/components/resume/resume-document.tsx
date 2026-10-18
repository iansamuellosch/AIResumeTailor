import { Fragment, type ReactNode } from "react";
import { resumeTemplates } from "@/lib/resume/templates";
import type { GeneratedResume } from "@/schemas/resume";
import { resumeBlocks, blockStyle, type ResumePart } from "@/lib/export/document";
export function ResumeDocument({ resume, renderPart, retainedPaths }: { resume: GeneratedResume; renderPart?: (part: ResumePart) => ReactNode; retainedPaths?: ReadonlySet<string> }) {
  const layout = resumeTemplates[resume.settings.template];
  return <article data-layout={resume.settings.template} style={{ fontFamily: layout.cssFont, padding: `clamp(16px, 5vw, ${layout.margin * 4 / 3}px)` }} aria-label={renderPart ? "Editable resume" : "Saved resume"} className="resume-document min-w-0 rounded-xl border bg-white mx-auto max-w-[816px] text-neutral-900">
    {resumeBlocks(resume, retainedPaths).map((block) => {
      const content = renderPart ? block.parts.map((part, index) => <Fragment key={part.path ?? index}>{part.path ? renderPart(part) : part.text}</Fragment>) : block.text;
      const style = blockStyle(block.kind, resume.settings.template);
      const props = { style: { fontSize: `${style.size * 4 / 3}px`, fontWeight: style.bold ? 700 : 400, marginTop: style.before * 4 / 3, marginBottom: style.after * 4 / 3, lineHeight: layout.lineHeight, textAlign: style.center ? "center" as const : "left" as const, borderBottom: style.rule ? "0.5pt solid #b8c2cc" : undefined, paddingBottom: style.rule ? "3pt" : undefined, whiteSpace: "pre-wrap" as const, overflowWrap: "anywhere" as const } };
      if (block.kind === "name") return <h2 key={block.key} {...props}>{content}</h2>;
      if (block.kind === "section") return <h3 key={block.key} {...props}>{content}</h3>;
      if (block.kind === "entry") return <h4 key={block.key} {...props}>{content}</h4>;
      if (block.kind === "bullet") return <ul key={block.key} className="list-disc pl-4" {...props}><li>{content}</li></ul>;
      return <p key={block.key} {...props}>{content}</p>;
    })}
  </article>;
}
