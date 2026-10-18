// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("uses RGBA PNG frames that Turbopack's favicon decoder accepts", () => {
  const icon = readFileSync(new URL("../src/app/favicon.ico", import.meta.url));
  expect(icon.readUInt16LE(2)).toBe(1);
  const count = icon.readUInt16LE(4);
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16;
    const start = icon.readUInt32LE(entry + 12);
    const length = icon.readUInt32LE(entry + 8);
    expect(start + length).toBeLessThanOrEqual(icon.length);
    const png = icon.subarray(start, start + length);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.subarray(12, 16).toString()).toBe("IHDR");
    // PNG color type 6 has four RGBA channels; type 2 (RGB) breaks ICO decoding.
    expect(png[25]).toBe(6);
  }
});
