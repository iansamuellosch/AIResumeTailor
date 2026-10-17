"use client";
import { useFormContext, type FieldPath } from "react-hook-form";
import type { ProfessionalProfile } from "@/schemas/profile";
import type { FieldDefinition } from "@/lib/profile/editor-config";

export function ProfileField({ name, definition, disabled = false }: { name: FieldPath<ProfessionalProfile>; definition: FieldDefinition; disabled?: boolean }) {
  const { register, getFieldState, formState } = useFormContext<ProfessionalProfile>();
  const error = getFieldState(name, formState).error;
  const inputId = `profile-${name}`;
  const base = "w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60";
  const registration = register(name, {
    ...((definition.kind === "month" || definition.optional) ? { setValueAs: (value: string) => value || undefined } : {}),
  });
  const common = {
    id: inputId, "aria-invalid": !!error,
    "aria-describedby": [definition.hint ? `${inputId}-hint` : "", error ? `${inputId}-error` : ""].filter(Boolean).join(" ") || undefined,
    disabled,
  };
  return <div className={`min-w-0 space-y-1.5 ${definition.kind === "textarea" ? "sm:col-span-2" : ""}`}>
    {definition.kind === "checkbox" ? (
      <label htmlFor={inputId} className="flex min-h-10 items-center gap-2 text-sm font-medium"><input {...registration} {...common} type="checkbox" className="size-4 accent-primary" />{definition.label}</label>
    ) : <>
      <label htmlFor={inputId} className="block text-sm font-medium">{definition.label}{definition.optional && <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>}</label>
      {definition.kind === "textarea" ? <textarea {...registration} {...common} rows={3} maxLength={10000} className={base} />
        : definition.kind === "select" ? <select {...registration} {...common} className={base}>{definition.options?.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select>
        : <input {...registration} {...common} type={definition.kind ?? "text"} maxLength={10000} className={base} />}
    </>}
    {definition.hint && <p id={`${inputId}-hint`} className="text-xs leading-5 text-muted-foreground">{definition.hint}</p>}
    {error && <p id={`${inputId}-error`} className="text-sm text-destructive">{error.message}</p>}
  </div>;
}
