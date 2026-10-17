import type { z } from "zod";
import { collections, personalFields } from "./editor-config";

/** Turn validation details into instructions for the person editing the field. */
export function profileValidationMessage(issue: z.core.$ZodIssue): string {
  const parts = issue.path.map(String);
  const key = parts.at(-1) ?? "";
  if (["id", "version", "status", "createdAt", "updatedAt", "verifiedAt"].includes(key)) return "Some saved information needs to be refreshed. Reload your profile and try again.";
  const collection = Object.values(collections).find((entry) => parts.join(".").startsWith(`${entry.name}.`));
  const fact = collection?.facts.find((entry) => parts.includes(entry.key));
  const field = parts[0] === "personalInfo" && parts[1] !== "additionalWebsites" ? personalFields.find((entry) => entry.key === key) : collection?.fields.find((entry) => entry.key === key);
  const label = field?.label.toLowerCase();
  const singular = fact?.singular ?? (parts[0] === "additionalAccomplishments" ? "accomplishment" : undefined);
  if (issue.code === "too_big" && issue.origin === "string") return `Use ${Number(issue.maximum).toLocaleString("en-US")} characters or fewer.`;
  if (issue.code === "too_small" || issue.code === "invalid_type") {
    if (singular) {
      const article = /^[aeiou]/i.test(singular) || singular === "honor" ? "an" : "a";
      return `Add ${article} ${singular}, or remove this item if you don't need it.`;
    }
    return label ? `Enter the ${label}.` : "Complete this field, or remove the item if you don't need it.";
  }
  if (key === "email") return "Enter a valid email address, such as name@example.com.";
  if (/url$/i.test(key)) return "Enter a complete link starting with https:// or http://.";
  if (issue.code === "invalid_format" && /date$/i.test(key)) return "Choose a month and year, or leave this blank if you're unsure.";
  if (issue.code === "invalid_value") return label ? `Choose a ${label} from the list.` : "Choose an option from the list.";
  if (issue.code === "custom") return issue.message;
  return "Check this value and try again.";
}
