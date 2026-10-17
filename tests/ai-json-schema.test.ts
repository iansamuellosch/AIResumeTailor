// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { toGeminiJsonSchema } from "@/lib/ai/json-schema";
import { jobAnalysisSchema } from "@/schemas/job";
vi.mock("server-only", () => ({}));
const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: generate }; } }));
import { requestStructured } from "@/lib/ai/structured";

describe("Gemini schema compatibility", () => {
  it("omits array caps without removing nested structure or identically named fields", () => {
    const schema = z.object({ maxItems: z.string(), groups: z.array(z.object({ values: z.array(z.string()).max(20) })).max(100) });
    const result = toGeminiJsonSchema(schema);
    expect(result.properties?.maxItems).toMatchObject({ type: "string" });
    expect(JSON.stringify(result)).not.toContain('"maxItems":20');
    expect(JSON.stringify(result)).not.toContain('"maxItems":100');
    expect(result.properties?.groups).toMatchObject({ type: "array", items: { type: "object", properties: { values: { type: "array", items: { type: "string" } } } } });
  });
  it("retains job-analysis limits in application validation", () => {
    const input = { jobTitle: "Developer", requiredSkills: Array.from({ length: 101 }, () => "React"), preferredSkills: [], responsibilities: [], qualifications: [], keywords: [] };
    expect(jobAnalysisSchema.safeParse(input).success).toBe(false);
    expect(toGeminiJsonSchema(jobAnalysisSchema).properties?.requiredSkills).not.toHaveProperty("maxItems");
  });
  it("rejects an oversized provider response despite the relaxed transport schema", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only");
    try {
      generate.mockResolvedValue({ text: JSON.stringify({ values: ["a", "b", "c"] }), candidates: [{ finishReason: "STOP" }] });
      await expect(requestStructured(z.object({ values: z.array(z.string()).max(2) }), "Extract facts", {})).rejects.toMatchObject({ code: "INVALID_AI_RESPONSE" });
      expect(generate.mock.calls[0][0].config.responseJsonSchema.properties.values).not.toHaveProperty("maxItems");
    } finally { vi.unstubAllEnvs(); }
  });
});
