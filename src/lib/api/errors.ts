export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly retryAfter?: number) {
    super(message);
    this.name = "ApiError";
  }
}
export function errorResponse(error: unknown): Response {
  const safe = error instanceof ApiError ? error : new ApiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  return Response.json({ success: false, error: { code: safe.code, message: safe.message } }, {
    status: safe.status,
    headers: { "Cache-Control": "no-store", ...(safe.retryAfter ? { "Retry-After": String(safe.retryAfter) } : {}) },
  });
}
