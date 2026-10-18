"use client";
import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY } from "@/lib/theme/preference";

function preference() {
  try { const value = localStorage.getItem(THEME_STORAGE_KEY); return value === "light" || value === "dark" ? value : undefined; }
  catch { return undefined; }
}
function applyPreference() {
  const saved = preference();
  document.documentElement.classList.toggle("dark", saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches));
}
function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const getSnapshot = () => document.documentElement.classList.contains("dark");
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followDevice = () => { if (!preference()) applyPreference(); };
    const syncTabs = (event: StorageEvent) => { if (event.key === THEME_STORAGE_KEY || event.key === null) applyPreference(); };
    media.addEventListener("change", followDevice); window.addEventListener("storage", syncTabs);
    return () => { media.removeEventListener("change", followDevice); window.removeEventListener("storage", syncTabs); };
  }, []);
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} onClick={() => {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* Keep the toggle usable when preference storage is unavailable. */ }
  }}><Moon aria-hidden="true" className="dark:hidden" /><Sun aria-hidden="true" className="hidden dark:block" /></Button>;
}
