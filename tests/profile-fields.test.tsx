import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { expect, it, vi } from "vitest";
import { ProfileField } from "@/components/profile/profile-field";
import { collections } from "@/lib/profile/editor-config";
import { skillSchema, type ProfessionalProfile } from "@/schemas/profile";
import { tailoringInput } from "./fixtures/tailoring";

function Fields({ profile, save }: { profile: ProfessionalProfile; save: (profile: ProfessionalProfile) => void }) {
  const form = useForm({ defaultValues: profile });
  return <FormProvider {...form}><form onSubmit={form.handleSubmit(save)}>
    <ProfileField name="experience.0.employmentType" definition={collections.experience.fields.find((field) => field.key === "employmentType")!} />
    <ProfileField name="skills.0.supportingContext" definition={collections.skills.fields.find((field) => field.key === "supportingContext")!} />
    <button type="submit">Save</button>
  </form></FormProvider>;
}
it("preserves saved custom employment types while offering standard options", async () => {
  const profile = tailoringInput().profile; profile.experience[0].employmentType = "Project-based consulting";
  const save = vi.fn(); render(<Fields profile={profile} save={save} />);
  expect(screen.getByLabelText("Employment type")).toHaveValue("Project-based consulting");
  expect(screen.queryByText(/For example, full-time/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].experience[0].employmentType).toBe("Project-based consulting");
  fireEvent.change(screen.getByLabelText("Employment type"), { target: { value: "Contract" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1][0].experience[0].employmentType).toBe("Contract");
});
it("shows legacy skill details together, preserves them until edited, and allows clearing both", async () => {
  const profile = tailoringInput().profile; profile.skills[0].proficiency = "Advanced"; profile.skills[0].supportingContext = "Used in production";
  const save = vi.fn(); render(<Fields profile={profile} save={save} />);
  const experience = screen.getByLabelText(/^Experience/);
  expect(experience).toHaveValue("Advanced · Used in production");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0].skills[0]).toMatchObject({ proficiency: "Advanced", supportingContext: "Used in production" });
  fireEvent.change(experience, { target: { value: "Advanced · Used in production React applications" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1][0].skills[0].supportingContext).toBe("Advanced · Used in production React applications");
  expect(save.mock.calls[1][0].skills[0].proficiency).toBeUndefined();
  expect(save.mock.calls[1][0].skills[0].id).toBe(profile.skills[0].id);
  fireEvent.change(experience, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
  expect(save.mock.calls[2][0].skills[0].supportingContext).toBeUndefined();
  expect(save.mock.calls[2][0].skills[0].proficiency).toBeUndefined();
});
it("accepts non-programming categories and preserves existing category values", () => {
  for (const category of ["healthcare", "finance-accounting", "sales", "education-training", "programming-languages", "frameworks-libraries", "professional", "other"]) {
    expect(skillSchema.safeParse({ id: "skill", name: "Verified skill", category }).success).toBe(true);
  }
  expect(skillSchema.safeParse({ id: "skill", name: "Verified skill", category: "invented-category" }).success).toBe(false);
});
