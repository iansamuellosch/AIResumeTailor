"use client";
import { useId } from "react";
import { resumeTemplates } from "@/lib/resume/templates";
import type { ResumeTemplate } from "@/schemas/resume-template";

/** Decorative paper thumbnail; real text and export styling come from the same layout definition. */
function LayoutThumbnail({ template, compact = false }: { template: ResumeTemplate; compact?: boolean }) {
  const layout = resumeTemplates[template];
  const left = layout.margin / 4;
  const width = 153 - left * 2;
  const dense = template === "compact";
  const center = layout.centeredHeader;
  return <svg aria-hidden="true" viewBox="0 0 153 198" className={`mx-auto w-full ${compact ? "max-w-16" : "max-w-32"} rounded-sm border bg-white text-slate-300 shadow-sm`}>
    <rect x={center ? 43 : left} y={left} width={center ? 67 : dense ? 65 : 79} height={dense ? 5 : 7} rx="1" fill="#64748b" />
    <rect x={center ? 38 : left} y={left + 12} width="77" height="2" rx="1" fill="currentColor" />
    <rect x={center ? 49 : left} y={left + 18} width="55" height="2" rx="1" fill="currentColor" />
    {[0, 1, 2, 3].map((section) => {
      const y = left + 33 + section * (dense ? 32 : 37);
      return <g key={section}>
        <rect x={left} y={y} width={section === 2 ? 23 : 36} height="3" rx="0.8" fill="#94a3b8" />
        {layout.sectionRules && <line x1={left} x2={153 - left} y1={y + 6} y2={y + 6} stroke="#cbd5e1" strokeWidth="0.6" />}
        {Array.from({ length: dense ? 5 : 4 }, (_, line) => <rect key={line} x={left + (section === 1 ? 3 : 0)} y={y + 10 + line * (dense ? 4 : 5)} width={width * (line === 2 ? 0.76 : line === 3 ? 0.9 : 1) - (section === 1 ? 3 : 0)} height="1.6" rx="0.8" fill="currentColor" />)}
      </g>;
    })}
  </svg>;
}
export function LayoutPicker({ value, onChange, disabled = false, compact = false }: { value: ResumeTemplate; onChange: (value: ResumeTemplate) => void; disabled?: boolean; compact?: boolean }) {
  const id = useId();
  return <fieldset disabled={disabled} className="min-w-0 space-y-3">
    <legend className="text-sm font-semibold">Resume layout</legend>
    <div className={`grid grid-cols-3 ${compact ? "gap-2" : "gap-2 sm:gap-4"}`}>
      {(Object.keys(resumeTemplates) as ResumeTemplate[]).map((template) => {
        const layout = resumeTemplates[template];
        return <label key={template} className="min-w-0 cursor-pointer">
          <input type="radio" name={`${id}-layout`} value={template} checked={value === template} onChange={() => onChange(template)} aria-label={layout.name} aria-describedby={`${id}-${template}`} className="peer sr-only" />
          <span className={`block h-full rounded-lg border bg-background p-2 transition-colors hover:border-primary/60 peer-checked:border-primary peer-checked:bg-accent/40 peer-checked:ring-1 peer-checked:ring-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring peer-disabled:cursor-default peer-disabled:opacity-60 ${compact ? "" : "sm:p-3"}`}>
            <LayoutThumbnail template={template} compact={compact} />
            <span className="mt-3 block text-center text-sm font-semibold">{layout.name}</span>
            <span id={`${id}-${template}`} className={`mt-1 hidden text-center text-xs leading-5 text-muted-foreground ${compact ? "" : "sm:block"}`}>{layout.description}</span>
          </span>
        </label>;
      })}
    </div>
  </fieldset>;
}
