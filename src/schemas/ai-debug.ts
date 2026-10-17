import { z } from "zod";

export const aiDebugCallSchema = z.object({
  callId: z.string(), operation: z.string(),
  direction: z.enum(["request", "response", "error"]),
  payload: z.unknown(), truncated: z.boolean(),
});
export const aiDebugSchema = z.object({ calls: z.array(aiDebugCallSchema) });
export type AiDebugCall = z.infer<typeof aiDebugCallSchema>;
