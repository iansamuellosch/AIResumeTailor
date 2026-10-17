import type { GeneratedResume } from "@/schemas/resume";
import { resumeBlocks, blockStyle } from "@/lib/export/document";
export function ResumeDocument({ resume }: { resume: GeneratedResume }) {
  return <article aria-label="Saved resume" className="resume-document min-w-0 rounded-xl border bg-white p-6 text-neutral-900 sm:p-12">
    {resumeBlocks(resume).map((block, index) => {
      const style = blockStyle(block.kind);
      const props = { style: { fontSize: `${style.size * 4 / 3}px`, fontWeight: style.bold ? 700 : 400, marginTop: style.before * 4 / 3, marginBottom: style.after * 4 / 3, lineHeight: 1.4, whiteSpace: "pre-wrap" as const, overflowWrap: "anywhere" as const } };
      if (block.kind === "name") return <h2 key={index} {...props}>{block.text}</h2>;
      if (block.kind === "section") return <h3 key={index} {...props}>{block.text}</h3>;
      if (block.kind === "entry") return <h4 key={index} {...props}>{block.text}</h4>;
      if (block.kind === "bullet") return <ul key={index} className="list-disc pl-4" {...props}><li>{block.text}</li></ul>;
      return <p key={index} {...props}>{block.text}</p>;
    })}
  </article>;
}
