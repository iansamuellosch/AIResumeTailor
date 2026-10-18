"use client";
import { useRef, useState, type Ref } from "react";
import { Popover } from "radix-ui";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SearchableSelect({ id, value, options, onChange, onBlur, buttonRef, disabled, invalid, describedBy }: {
  id: string; value: string; options: readonly { value: string; label: string }[];
  onChange: (value: string) => void; onBlur: () => void; buttonRef: Ref<HTMLButtonElement>;
  disabled?: boolean; invalid?: boolean; describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const matches = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  const listId = `${id}-options`;
  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) { setQuery(""); setActive(Math.max(0, options.findIndex((option) => option.value === value))); }
    else onBlur();
  }
  function select(next: string) { onChange(next); changeOpen(false); }
  function highlight(next: number) {
    if (!matches.length) return;
    const index = (next + matches.length) % matches.length;
    setActive(index);
    document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: "nearest" });
  }
  return <Popover.Root open={open} onOpenChange={changeOpen}>
    <Popover.Trigger asChild>
      <Button ref={buttonRef} id={id} type="button" variant="outline" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-invalid={invalid} aria-describedby={describedBy} disabled={disabled}
        onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); changeOpen(true); } }}
        className="h-auto min-h-9 w-full min-w-0 cursor-pointer justify-between whitespace-normal text-left font-normal">
        <span>{options.find((option) => option.value === value)?.label ?? value}</span><ChevronsUpDown aria-hidden="true" className="shrink-0 text-muted-foreground" />
      </Button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content aria-label="Choose a skill category" align="start" sideOffset={4} className="z-50 w-[var(--radix-popover-trigger-width)] rounded-lg border bg-popover p-2 text-popover-foreground shadow-md" onOpenAutoFocus={(event) => { event.preventDefault(); input.current?.focus(); }}>
        <input ref={input} role="combobox" aria-label="Search categories" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
          value={query} placeholder="Search categories…" className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
          onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); highlight(active + 1); }
            if (event.key === "ArrowUp") { event.preventDefault(); highlight(active - 1); }
            if (event.key === "Enter") { event.preventDefault(); if (matches[active]) select(matches[active].value); }
          }} />
        <div id={listId} role="listbox" aria-label="Skill categories" className="max-h-56 overflow-y-auto overscroll-contain">
          {matches.map((option, index) => <button key={option.value} id={`${listId}-${index}`} type="button" role="option" tabIndex={-1} aria-selected={option.value === value}
            onPointerMove={() => setActive(index)} onClick={() => select(option.value)} className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm ${active === index ? "bg-accent text-accent-foreground" : "hover:bg-accent"}`}>
            {option.label}{option.value === value && <Check aria-hidden="true" className="size-4 shrink-0" />}
          </button>)}
          {!matches.length && <p role="status" className="px-3 py-2 text-sm text-muted-foreground">No matching categories.</p>}
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
