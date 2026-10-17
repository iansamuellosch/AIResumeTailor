export function QualityWarnings({ warnings }: { warnings?: string[] }) {
  if (!warnings?.length) return null;
  return <section aria-label="Resume quality warnings" className="space-y-2 rounded-lg border bg-card p-4 text-sm">
    <h2 className="font-semibold">Quality suggestions to review</h2>
    <p className="text-muted-foreground">These suggestions describe the generated draft and do not block saving or export. Review them alongside any edits. Factual checks are separate.</p>
    <ul className="list-disc space-y-1 pl-5">{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
  </section>;
}
