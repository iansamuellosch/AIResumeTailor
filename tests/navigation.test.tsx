import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Navigation } from "@/components/layout/navigation";
vi.mock("next/navigation", () => ({ usePathname: () => "/profile" }));
it("provides all primary routes and identifies the active page", () => {
  render(<Navigation />);
  expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  for (const [name, href] of [["Overview", "/"], ["Profile", "/profile"], ["Dashboard", "/dashboard"], ["Settings", "/settings"]]) {
    expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  }
});
