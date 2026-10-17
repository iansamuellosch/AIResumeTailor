import { describe, expect, it } from "vitest";
import { createEmptyProfile, professionalProfileSchema } from "@/schemas/profile";
import { collections } from "@/lib/profile/editor-config";
import { profileValidationMessage } from "@/lib/profile/validation-messages";

function messages(profile: unknown) {
  const result = professionalProfileSchema.safeParse(profile);
  expect(result.success).toBe(false);
  return result.error!.issues.map(profileValidationMessage);
}

describe("readable profile validation", () => {
  it("names required fields and explains how to handle empty achievements", () => {
    const profile = createEmptyProfile();
    profile.experience.push({ ...collections.experience.create(), achievements: [{ id: "achievement", text: "" }] } as typeof profile.experience[number]);
    expect(messages(profile)).toEqual([
      "Enter the employer.", "Enter the job title.",
      "Add an achievement, or remove this item if you don't need it.",
    ]);
  });

  it("provides email, safe-link, and length guidance without changing validation", () => {
    const profile = createEmptyProfile();
    profile.personalInfo.email = "unfinished@";
    profile.personalInfo.portfolioUrl = "javascript:alert(1)";
    profile.summary = "x".repeat(10001);
    expect(messages(profile)).toEqual([
      "Enter a valid email address, such as name@example.com.",
      "Enter a complete link starting with https:// or http://.",
      "Use 10,000 characters or fewer.",
    ]);
  });

  it("explains date order and still permits equal start and end months", () => {
    const profile = createEmptyProfile();
    const work = { ...collections.experience.create(), employer: "Example", jobTitle: "Developer", startDate: "2025-01", endDate: "2024-01" } as typeof profile.experience[number];
    profile.experience.push(work);
    expect(messages(profile)).toEqual(["Choose an end date that is the same as or later than the start date."]);
    work.endDate = work.startDate;
    expect(professionalProfileSchema.safeParse(profile).success).toBe(true);
    work.endDate = "2025-13";
    expect(messages(profile)).toContain("Choose a month and year, or leave this blank if you're unsure.");
  });

  it("keeps optional fields optional and asks for a name only on approval", () => {
    const profile = createEmptyProfile();
    expect(professionalProfileSchema.safeParse(profile).success).toBe(true);
    expect(messages({ ...profile, status: "verified", verifiedAt: profile.updatedAt })).toEqual(["Enter your full name before continuing."]);
  });
});
