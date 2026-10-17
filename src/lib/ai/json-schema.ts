import { z } from "zod";

/** Large array caps can make Gemini's constrained-output schema fail to compile.
 * Keep them in Zod for validation; omit them only from the provider schema.
 */
export function toGeminiJsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, { override: ({ jsonSchema }) => { delete jsonSchema.maxItems; } });
}
