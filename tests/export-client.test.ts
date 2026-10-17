import { afterEach, expect, it, vi } from "vitest";
import { downloadResume } from "@/lib/export/client";
import { exportFixture } from "./fixtures/export";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("reports font fetch failures before starting PDF work and preserves the resume", async () => {
  const worker = vi.fn(); vi.stubGlobal("Worker", worker); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const resume = exportFixture(); const before = structuredClone(resume);
  await expect(downloadResume(resume, "pdf")).rejects.toThrow("Could not load PDF fonts");
  expect(worker).not.toHaveBeenCalled(); expect(resume).toEqual(before);
});
it("terminates stalled export work after the deadline so the user can retry", async () => {
  vi.useFakeTimers(); const terminate = vi.fn();
  vi.stubGlobal("Worker", class { onmessage = null; onerror = null; postMessage = vi.fn(); terminate = terminate; });
  const pending = expect(downloadResume(exportFixture(), "docx")).rejects.toThrow("took too long");
  await vi.advanceTimersByTimeAsync(45000); await pending; expect(terminate).toHaveBeenCalledTimes(1);
});
it("rejects malformed worker results and terminates the worker", async () => {
  const terminate = vi.fn();
  vi.stubGlobal("Worker", class {
    onmessage?: (event: { data: unknown }) => void; onerror = null;
    postMessage() { queueMicrotask(() => this.onmessage?.({ data: { ok: true, buffer: new ArrayBuffer(0) } })); }
    terminate = terminate;
  });
  await expect(downloadResume(exportFixture(), "docx")).rejects.toThrow("incomplete file"); expect(terminate).toHaveBeenCalledTimes(1);
});
