"use client";
import { useFieldArray, useFormContext, useWatch, type FieldArrayPath, type FieldPath } from "react-hook-form";
import type { ProfessionalProfile } from "@/schemas/profile";
import type { CollectionDefinition } from "@/lib/profile/editor-config";
import { Button } from "@/components/ui/button";
import { ProfileField } from "./profile-field";
import { RemoveButton } from "./remove-button";
import { FactList } from "./fact-list";

function EntryFields({ config, index }: { config: CollectionDefinition; index: number }) {
  const { control, setValue } = useFormContext<ProfessionalProfile>();
  const currentName = `experience.${index}.currentlyEmployed` as const;
  const currentlyEmployed = useWatch({ control, name: currentName, disabled: config.name !== "experience" });
  return <>
    <div className="grid gap-4 sm:grid-cols-2">
      {config.fields.map((definition) => <div key={definition.key} className={definition.kind === "textarea" || definition.kind === "skill-experience" ? "sm:col-span-2" : ""}
        onChange={definition.key === "currentlyEmployed" ? (event) => {
          if ((event.target as HTMLInputElement).checked) setValue(`experience.${index}.endDate`, undefined, { shouldDirty: true });
        } : undefined}>
        <ProfileField name={`${config.name}.${index}.${definition.key}` as FieldPath<ProfessionalProfile>} definition={definition} disabled={config.name === "experience" && definition.key === "endDate" && !!currentlyEmployed} />
      </div>)}
    </div>
    {config.name === "experience" && <p className="text-xs leading-5 text-muted-foreground">Leave unknown dates blank. Record partial dates in additional accomplishments instead of guessing a month.</p>}
    {config.facts.map((fact) => <FactList key={`${config.name}.${index}.${fact.key}`} name={`${config.name}.${index}.${fact.key}` as FieldArrayPath<ProfessionalProfile>} label={fact.label} singular={fact.singular} />)}
  </>;
}
export function CollectionEditor({ config }: { config: CollectionDefinition }) {
  const { control } = useFormContext<ProfessionalProfile>();
  const { fields, append, remove } = useFieldArray<ProfessionalProfile, typeof config.name, "_formKey">({ control, name: config.name, keyName: "_formKey" });
  return <div className="space-y-5">
    {fields.length === 0 && <p className="text-sm text-muted-foreground">No {config.title.toLowerCase()} added. Add only information you can verify.</p>}
    {fields.map((field, index) => <fieldset key={field._formKey} className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-5">
      <legend className="px-2 text-base font-semibold">{config.singular[0].toUpperCase()}{config.singular.slice(1)} {index + 1}</legend>
      <EntryFields config={config} index={index} />
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <RemoveButton aria-label={`Delete ${config.singular} ${index + 1}`} onClick={() => {
          if (window.confirm(`Delete this ${config.singular} and its facts from your draft? Your approved profile stays unchanged until you approve the draft.`)) remove(index);
        }}>Delete entry</RemoveButton>
      </div>
    </fieldset>)}
    <Button type="button" variant="outline" onClick={() => append(config.create())}>Add {config.singular}</Button>
  </div>;
}
