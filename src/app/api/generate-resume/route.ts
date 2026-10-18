import { withAiDebug } from "@/lib/ai/debug-response";
import { tailorResumeRequestSchema } from "@/schemas/resume";
import { readLimitedJson } from "@/lib/api/request";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { reserveTailoringRun, issueReviewPermit } from "@/lib/api/rate-limit";
import { generateResumeWithGemini } from "@/lib/ai/tailoring";
export const runtime = "nodejs";
// Initial writing + at most one schema repair, each with a 45-second deadline.
export const maxDuration = 120;
export async function POST(request: Request) {
  return withAiDebug(async () => {
    try {
      const input = tailorResumeRequestSchema.safeParse(await readLimitedJson(request));
      if (!input.success) throw new ApiError(400, "INVALID_REQUEST", "Provide a saved profile, job description, and resume settings. Large profiles may exceed the request limit.");
      const admission = await reserveTailoringRun(request);
      const resume = await generateResumeWithGemini(input.data, request.signal);
      // Preserve a completed draft even if Redis becomes unavailable after writing.
      const reviewPermit = await issueReviewPermit(admission, resume).catch(() => undefined);
      return Response.json({ success: true, data: { resume, reviewPermit } }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return errorResponse(error); }
  });
}
