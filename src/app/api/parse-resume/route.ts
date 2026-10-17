import { parseResumeRequestSchema } from "@/schemas/parse-resume";
import { readLimitedJson } from "@/lib/api/request";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { enforceParseRateLimit } from "@/lib/api/rate-limit";
import { parseResumeWithGemini } from "@/lib/ai/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await enforceParseRateLimit(request);
    const input = parseResumeRequestSchema.safeParse(await readLimitedJson(request));
    if (!input.success) throw new ApiError(400, "INVALID_REQUEST", "Provide readable resume text between 20 and 60,000 characters.");
    const profile = await parseResumeWithGemini(input.data.text, request.signal);
    return Response.json({ success: true, data: { profile } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
