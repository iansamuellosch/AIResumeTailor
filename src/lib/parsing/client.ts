import { apiErrorSchema, parseResumeResponseSchema } from "@/schemas/parse-resume";

export async function requestProfileDraft(text: string) {
  let response: Response;
  try {
    response = await fetch("/api/parse-resume", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }), signal: AbortSignal.timeout(55_000),
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "name" in error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error("AI processing timed out. Your file is saved locally. Try again.");
    throw new Error("Could not reach the server. Check your connection and try again. Your file is saved locally.");
  }
  const json: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(json);
    throw new Error(error.success ? error.data.error.message : "Could not parse your resume. Try again later.");
  }
  const result = parseResumeResponseSchema.safeParse(json);
  if (!result.success) throw new Error("The server returned an invalid draft. Your file is saved locally. Try again.");
  return result.data.data.profile;
}
