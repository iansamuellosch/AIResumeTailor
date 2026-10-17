import { generateResumeRequestSchema } from "@/schemas/resume";
import { readLimitedJson } from "@/lib/api/request";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { enforceAiRateLimit } from "@/lib/api/rate-limit";
import { generateResumeWithGemini } from "@/lib/ai/tailoring";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    await enforceAiRateLimit(request);
    const input = generateResumeRequestSchema.safeParse(await readLimitedJson(request));
    if (!input.success) throw new ApiError(400, "INVALID_REQUEST", "Provide an approved profile, valid job analysis, and resume settings. Large profiles may exceed the request limit.");
    const resume = await generateResumeWithGemini(input.data, request.signal);
    return Response.json({ success: true, data: { resume } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
