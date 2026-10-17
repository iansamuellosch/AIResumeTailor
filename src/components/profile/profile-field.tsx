"use client";
import { Controller, useFormContext, useWatch, type FieldPath } from "react-hook-form";
import type { ProfessionalProfile } from "@/schemas/profile";
import type { FieldDefinition } from "@/lib/profile/editor-config";
import { SearchableSelect } from "./searchable-select";

function SkillExperience({ name, inputProps, className }: { name: FieldPath<ProfessionalProfile>; inputProps: { id: string; disabled: boolean; "aria-invalid": boolean; "aria-describedby"?: string }; className: string }) {
  const { control, setValue } = useFormContext<ProfessionalProfile>();
  const proficiencyName = name.replace(/supportingContext$/, "proficiency") as FieldPath<ProfessionalProfile>;
  const proficiency = useWatch({ control, name: proficiencyName });
  return <Controller control={control} name={name} render={({ field }) => {
    // Display existing information together without rewriting saved facts on mount.
    const value = [typeof proficiency === "string" ? proficiency : "", typeof field.value === "string" ? field.value : ""].filter(Boolean).join(" · ");
    return <input {...inputProps} ref={field.ref} name={field.name} value={value} onBlur={field.onBlur} maxLength={10000} placeholder="e.g. Daily use in customer-facing work" className={className} onChange={(event) => {
      setValue(proficiencyName, undefined, { shouldDirty: true });
      field.onChange(event.target.value || undefined);
    }} />;
  }} />;
}

export function ProfileField({ name, definition, disabled = false, hideLabel = false }: { name: FieldPath<ProfessionalProfile>; definition: FieldDefinition; disabled?: boolean; hideLabel?: boolean }) {
  const { register, control, getFieldState, formState } = useFormContext<ProfessionalProfile>();
  const selected = useWatch({ control, name, disabled: definition.kind !== "select" });
  const error = getFieldState(name, formState).error;
  const inputId = `profile-${name}`;
  const base = "w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60";
  const registration = definition.kind === "search-select" || definition.kind === "skill-experience" ? undefined : register(name, {
    ...((definition.kind === "month" || definition.optional) ? { setValueAs: (value: string) => value || undefined } : {}),
  });
  const options = definition.options ?? [];
  const savedOption = definition.kind === "select" && typeof selected === "string" && !options.some((option) => option.value === selected) ? selected : undefined;
  const common = {
    id: inputId, "aria-invalid": !!error,
    "aria-describedby": [definition.hint ? `${inputId}-hint` : "", error ? `${inputId}-error` : ""].filter(Boolean).join(" ") || undefined,
    disabled,
  };
  return <div className={`min-w-0 ${hideLabel ? "" : "space-y-1.5"} ${definition.kind === "textarea" ? "sm:col-span-2" : ""}`}>
    {definition.kind === "checkbox" ? (
      <label htmlFor={inputId} className="flex min-h-10 items-center gap-2 text-sm font-medium"><input {...registration} {...common} type="checkbox" className="size-4 accent-primary" />{definition.label}</label>
    ) : <>
      <label htmlFor={inputId} className={hideLabel ? "sr-only" : "block text-sm font-medium"}>{definition.label}{definition.optional && <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>}</label>
      {definition.kind === "textarea" ? <textarea {...registration} {...common} rows={3} maxLength={10000} className={base} />
        : definition.kind === "search-select" ? <Controller control={control} name={name} render={({ field }) => <SearchableSelect id={inputId} value={typeof field.value === "string" ? field.value : ""} options={options} onChange={field.onChange} onBlur={field.onBlur} buttonRef={field.ref} disabled={disabled} invalid={!!error} describedBy={common["aria-describedby"]} />} />
        : definition.kind === "skill-experience" ? <SkillExperience name={name} inputProps={common} className={base} />
        : definition.kind === "select" ? <select {...registration} {...common} className={base}>
          {savedOption !== undefined && <option value={savedOption}>{savedOption} (saved)</option>}
          {options.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
        : <input {...registration} {...common} type={definition.kind ?? "text"} maxLength={10000} className={base} />}
    </>}
    {definition.hint && <p id={`${inputId}-hint`} className="text-xs leading-5 text-muted-foreground">{definition.hint}</p>}
    {error && <p id={`${inputId}-error`} className="text-sm text-destructive">{error.message}</p>}
  </div>;
}
