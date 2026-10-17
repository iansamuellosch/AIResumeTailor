import { withAiDebug } from "@/lib/ai/debug-response";
import { analyzeJobRequestSchema } from "@/schemas/job";
import { readLimitedJson } from "@/lib/api/request";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { enforceAiRateLimit } from "@/lib/api/rate-limit";
import { analyzeJobWithGemini } from "@/lib/ai/tailoring";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return withAiDebug(async () => {
    try {
      await enforceAiRateLimit(request);
      const input = analyzeJobRequestSchema.safeParse(await readLimitedJson(request));
      if (!input.success) throw new ApiError(400, "INVALID_REQUEST", "Provide a job description between 20 and 30,000 characters and valid optional details.");
      const jobAnalysis = await analyzeJobWithGemini(input.data, request.signal);
      return Response.json({ success: true, data: { jobAnalysis } }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return errorResponse(error); }
  });
}
