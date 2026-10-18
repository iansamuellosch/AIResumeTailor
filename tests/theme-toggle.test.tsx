import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { THEME_STORAGE_KEY } from "@/lib/theme/preference";
beforeEach(() => {
  document.documentElement.classList.remove("dark"); localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.documentElement.classList.remove("dark"); localStorage.clear(); });
it("toggles light and dark with accessible action labels and remembers the choice", async () => {
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
  expect(document.documentElement).toHaveClass("dark");
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  fireEvent.click(await screen.findByRole("button", { name: "Switch to light theme" }));
  expect(document.documentElement).not.toHaveClass("dark");
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
});
it("still changes the visible theme when browser preference storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
  expect(await screen.findByRole("button", { name: "Switch to light theme" })).toBeEnabled();
  expect(document.documentElement).toHaveClass("dark");
});
