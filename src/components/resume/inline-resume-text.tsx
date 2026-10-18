"use client";
import { useLayoutEffect, useRef } from "react";
import { formatMonth } from "@/lib/export/document";

export function normalizeInlineDate(text: string): string {
  const value = text.trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  const match = /^([a-z]+)\s+(\d{4})$/i.exec(value);
  const month = match ? ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].findIndex((name) => name === match[1].toLowerCase() || name.slice(0, 3) === match[1].toLowerCase()) : -1;
  return match && month >= 0 ? `${match[2]}-${String(month + 1).padStart(2, "0")}` : text;
}
function plainText(node: HTMLElement): string {
  const copy = node.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[data-inline-tail]").forEach((tail) => tail.remove());
  copy.querySelectorAll("br").forEach((br) => br.replaceWith(document.createTextNode("\n")));
  // Fallback for browsers that insert block nodes for virtual-keyboard breaks.
  copy.querySelectorAll("div, p").forEach((block) => block.after(document.createTextNode("\n")));
  return (copy.textContent ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
}
function refreshTail(node: HTMLElement) {
  node.querySelectorAll("[data-inline-tail]").forEach((tail) => tail.remove());
  // A trailing break needs a visual caret stop. It is never saved as content.
  if (plainText(node).endsWith("\n")) { const tail = document.createElement("br"); tail.dataset.inlineTail = ""; node.append(tail); }
}

/** An isolated plain-text editing host. React never reconciles its DOM children,
 * so normal typing and IME composition keep their caret/selection on rerenders.
 */
export function InlineResumeText({ value, label, id, date = false, multiline = false, disabled, onChange }: { value: string; label: string; id?: string; date?: boolean; multiline?: boolean; disabled: boolean; onChange: (value: string) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const composing = useRef(false);
  const emitted = useRef<string | undefined>(undefined);
  const display = date ? formatMonth(value) : value;
  const history = useRef([{ text: display, offset: display.length }]);
  const historyIndex = useRef(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || composing.current || (document.activeElement === node && emitted.current === value)) return;
    if (plainText(node) !== display) { node.textContent = display; refreshTail(node); }
    if (value !== emitted.current) {
      history.current = [{ text: display, offset: display.length }]; historyIndex.current = 0;
      emitted.current = value;
    }
  }, [value, display, disabled]);
  function commit(text: string, remember = true) {
    const node = ref.current;
    if (remember && text !== history.current[historyIndex.current].text) {
      let offset = text.length;
      const selection = window.getSelection();
      if (node && selection?.rangeCount && node.contains(selection.getRangeAt(0).endContainer)) {
        const before = selection.getRangeAt(0).cloneRange();
        before.selectNodeContents(node); before.setEnd(selection.getRangeAt(0).endContainer, selection.getRangeAt(0).endOffset);
        offset = before.toString().length;
      }
      history.current = history.current.slice(0, historyIndex.current + 1);
      history.current.push({ text, offset });
      if (history.current.length > 100) history.current.shift();
      historyIndex.current = history.current.length - 1;
    }
    emitted.current = text;
    if (text !== value) onChange(text);
  }
  function undo(direction: number) {
    const node = ref.current; const next = historyIndex.current + direction;
    if (!node || disabled || next < 0 || next >= history.current.length) return;
    historyIndex.current = next;
    const snapshot = history.current[next]; node.textContent = snapshot.text; refreshTail(node);
    const range = document.createRange(); const selection = window.getSelection();
    range.setStart(node.firstChild ?? node, node.firstChild ? Math.min(snapshot.offset, snapshot.text.length) : 0); range.collapse(true);
    selection?.removeAllRanges(); selection?.addRange(range);
    commit(snapshot.text, false);
  }
  function insert(text: string) {
    const node = ref.current;
    if (!node || disabled) return;
    node.querySelectorAll("[data-inline-tail]").forEach((tail) => tail.remove());
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    if (range && node.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      const inserted = document.createTextNode(text);
      range.insertNode(inserted); refreshTail(node); range.setStartAfter(inserted); range.collapse(true);
      selection!.removeAllRanges(); selection!.addRange(range);
    } else { node.append(document.createTextNode(text)); refreshTail(node); }
    commit(plainText(node));
  }
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const beforeInput = (event: InputEvent) => {
      if (disabled || composing.current || event.isComposing) return;
      const type = event.inputType;
      if (type === "historyUndo" || type === "historyRedo") { event.preventDefault(); undo(type === "historyUndo" ? -1 : 1); }
      if (type === "insertParagraph" || type === "insertLineBreak") { event.preventDefault(); if (multiline) insert("\n"); }
      if (type.startsWith("format")) event.preventDefault();
    };
    node.addEventListener("beforeinput", beforeInput);
    return () => node.removeEventListener("beforeinput", beforeInput);
  });
  return <span id={id} ref={ref} role="textbox" aria-label={label} aria-multiline={multiline} aria-disabled={disabled} aria-describedby={date ? "inline-date-help" : undefined} contentEditable={disabled ? false : "plaintext-only"} suppressContentEditableWarning spellCheck={!date} tabIndex={disabled ? -1 : 0} data-placeholder={label} className="resume-inline-text"
    onInput={(event) => { if (!disabled && !composing.current && !(event.nativeEvent as InputEvent).isComposing) { refreshTail(event.currentTarget); commit(plainText(event.currentTarget)); } }}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={(event) => { composing.current = false; if (!disabled) commit(plainText(event.currentTarget)); }}
    onBlur={(event) => {
      if (disabled || composing.current) return;
      const text = plainText(event.currentTarget);
      const normalized = date ? normalizeInlineDate(text) : text;
      commit(normalized, false);
      const nextDisplay = date ? formatMonth(normalized) : normalized;
      if (plainText(event.currentTarget) !== nextDisplay) { event.currentTarget.textContent = nextDisplay; refreshTail(event.currentTarget); }
      history.current[historyIndex.current] = { text: nextDisplay, offset: nextDisplay.length };
    }}
    onKeyDown={(event) => {
      if (composing.current || event.nativeEvent.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); undo(event.key.toLowerCase() === "y" || event.shiftKey ? 1 : -1); return; }
      if (event.key === "Enter") { event.preventDefault(); if (multiline) insert("\n"); }
      if ((event.metaKey || event.ctrlKey) && ["b", "i", "u"].includes(event.key.toLowerCase())) event.preventDefault();
    }}
    onPaste={(event) => { event.preventDefault(); const text = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n"); insert(multiline ? text : text.replace(/\n+/g, " ")); }}
    onDrop={(event) => event.preventDefault()}
  />;
}
