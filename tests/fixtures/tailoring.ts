import { createEmptyProfile, professionalProfileSchema } from "@/schemas/profile";
import { defaultResumeSettings, type GenerateResumeInput, type ResumeSelection } from "@/schemas/resume";
import { assembleResume } from "@/lib/generation/assemble";
import { selectEvidence } from "@/lib/generation/evidence";

export function tailoringInput(): GenerateResumeInput & { jobDescription: string } {
  const profile = createEmptyProfile();
  profile.personalInfo.fullName = "Alex Doe";
  profile.personalInfo.email = "alex@example.test";
  profile.status = "verified"; profile.verifiedAt = profile.updatedAt;
  profile.headline = "Software Engineer"; profile.summary = "Develops React applications.";
  profile.experience = [
    { id: "job-1", employer: "Example Co", jobTitle: "Engineer", location: "", employmentType: "", workArrangement: "remote", currentlyEmployed: true, startDate: "2023-04", responsibilities: [{ id: "fact-1", text: "Integrated REST APIs into React applications." }], achievements: [{ id: "fact-2", text: "Reduced load times by 20%." }], technologies: [], quantifiableResults: [] },
    { id: "job-2", employer: "Other Co", jobTitle: "Assistant", location: "", employmentType: "", workArrangement: "unspecified", currentlyEmployed: false, responsibilities: [{ id: "fact-3", text: "Prepared reports." }], achievements: [], technologies: [], quantifiableResults: [] },
  ];
  profile.skills = [{ id: "skill-1", name: "React", category: "frameworks-libraries" }];
  return { jobDescription: "Frontend engineer developing React applications and integrating REST APIs.", profile: professionalProfileSchema.parse(profile), jobAnalysis: { jobTitle: "Frontend Engineer", requiredSkills: ["React", "REST APIs"], preferredSkills: [], keywords: ["React"], qualifications: [], responsibilities: ["Develop React applications"] }, settings: { ...defaultResumeSettings }, notes: "", jobUrl: "" };
}
export function selection(): ResumeSelection {
  return { headline: "Software Engineer", summary: "Develops React applications.", experience: [{ sourceId: "job-1", bullets: [{ text: "Integrated REST APIs into React applications.", evidenceIds: ["fact-1"] }] }], projects: [], skillIds: ["skill-1"], educationIds: [], certificationIds: [] };
}
export function savedResume() {
  const input = tailoringInput();
  return assembleResume(input, selectEvidence(input.profile, input.jobAnalysis, input.settings), selection());
}
