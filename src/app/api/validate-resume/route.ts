import { validateResumeRequestSchema } from "@/schemas/validation";
import { readLimitedJson } from "@/lib/api/request";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { enforceAiRateLimit } from "@/lib/api/rate-limit";
import { validateResumeWithGemini } from "@/lib/ai/validation";
export const runtime = "nodejs";
// Review + one correction + revalidation, each with a 45-second provider deadline.
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    await enforceAiRateLimit(request);
    const input = validateResumeRequestSchema.safeParse(await readLimitedJson(request));
    if (!input.success) throw new ApiError(400, "INVALID_REQUEST", "Provide a valid resume and its approved source profile.");
    const resume = await validateResumeWithGemini(input.data, request.signal);
    return Response.json({ success: true, data: { resume } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
