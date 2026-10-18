import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/storage/database", async (original) => ({ ...await original<typeof import("@/lib/storage/database")>(), getDatabase: vi.fn() }));
import { ProfileGate } from "@/components/dashboard/profile-gate";
import { ResumeDatabase, getDatabase, saveProfile } from "@/lib/storage/database";
import { tailoringInput } from "./fixtures/tailoring";
let db: ResumeDatabase;
beforeEach(() => { vi.clearAllMocks(); db = new ResumeDatabase(`gate-${crypto.randomUUID()}`); vi.mocked(getDatabase).mockReturnValue(db); });
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });
it("redirects a draft-only visitor without showing the dashboard", async () => {
  await saveProfile(db, { ...tailoringInput().profile, status: "draft", verifiedAt: undefined });
  render(<ProfileGate />);
  expect(screen.queryByRole("heading", { name: "Your next opportunity" })).not.toBeInTheDocument();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/profile"));
});
it("keeps access during unfinished edits and redirects if the approved profile is removed", async () => {
  const profile = tailoringInput().profile; await saveProfile(db, profile);
  render(<ProfileGate />);
  expect(await screen.findByRole("heading", { name: "Your next opportunity" })).toBeVisible();
  await saveProfile(db, { ...profile, status: "draft", verifiedAt: undefined });
  expect(router.replace).not.toHaveBeenCalled();
  await db.profiles.clear();
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/profile"));
  expect(screen.queryByRole("heading", { name: "Your next opportunity" })).not.toBeInTheDocument();
});
it("shows storage failures without treating them as an absent profile", async () => {
  vi.spyOn(db.profiles, "get").mockRejectedValue(new Error("Storage unavailable"));
  render(<ProfileGate />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not read the local profile");
  expect(router.replace).not.toHaveBeenCalled();
});
