import { z } from "zod";
import {
  personalInfoSchema, workExperienceSchema, educationSchema, skillSchema, projectSchema, certificationSchema,
  awardSchema, publicationSchema, volunteerExperienceSchema, languageSchema, membershipSchema, factSchema,
  type ProfessionalProfile,
} from "@/schemas/profile";
export function profileSectionStatus(profile: ProfessionalProfile): Record<string, string> {
  const collection = (values: unknown[], schema: z.ZodType) => values.length === 0 ? "Not added" : z.array(schema).safeParse(values).success ? `${values.length} added` : "Needs attention";
  const additional = [
    collection(profile.awards, awardSchema), collection(profile.publications, publicationSchema),
    collection(profile.volunteerExperience, volunteerExperienceSchema), collection(profile.languages, languageSchema),
    collection(profile.memberships, membershipSchema), collection(profile.additionalAccomplishments, factSchema),
  ];
  return {
    personal: personalInfoSchema.safeParse(profile.personalInfo).success && profile.personalInfo.fullName.trim() ? "Complete" : "Needs attention",
    summary: profile.headline || profile.summary || profile.careerObjective ? "Added" : "Not added",
    experience: collection(profile.experience, workExperienceSchema), education: collection(profile.education, educationSchema),
    skills: collection(profile.skills, skillSchema), projects: collection(profile.projects, projectSchema), certifications: collection(profile.certifications, certificationSchema),
    additional: additional.includes("Needs attention") ? "Needs attention" : additional.every((value) => value === "Not added") ? "Not added" : "Added",
  };
}
