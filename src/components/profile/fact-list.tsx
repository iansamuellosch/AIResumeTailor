"use client";
import { useFieldArray, useFormContext, type FieldArrayPath, type FieldPath } from "react-hook-form";
import type { ProfessionalProfile } from "@/schemas/profile";
import { Button } from "@/components/ui/button";
import { RemoveButton } from "./remove-button";
import { ProfileField } from "./profile-field";

export function FactList({ name, label, singular }: { name: FieldArrayPath<ProfessionalProfile>; label: string; singular: string }) {
  const { control } = useFormContext<ProfessionalProfile>();
  const { fields, append, remove } = useFieldArray({ control, name, keyName: "_formKey" });
  return <fieldset className="space-y-3 border-t pt-4">
    <legend className="px-1 text-sm font-semibold">{label}</legend>
    <div className={name.endsWith(".technologies") ? "grid gap-2 sm:grid-cols-2" : "space-y-3"}>
      {fields.map((field, index) => <div key={field._formKey} className={name.endsWith(".technologies") ? "flex min-w-0 items-start gap-2" : "space-y-2 rounded-lg bg-muted/40 p-3"}>
        <div className="min-w-0 flex-1"><ProfileField name={`${name}.${index}.text` as FieldPath<ProfessionalProfile>} hideLabel={name.endsWith(".technologies")} definition={{ key: "text", label: `${singular[0].toUpperCase()}${singular.slice(1)} ${index + 1}`, kind: name.endsWith(".technologies") ? undefined : "textarea" }} /></div>
        <RemoveButton className={name.endsWith(".technologies") ? "h-9" : undefined} onClick={() => remove(index)} aria-label={`Remove ${singular} ${index + 1}`}>Remove</RemoveButton>
      </div>)}
    </div>
    <Button type="button" variant="outline" size="sm" onClick={() => append({ id: crypto.randomUUID(), text: "" })}>Add {singular}</Button>
  </fieldset>;
}
