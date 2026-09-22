import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read=(path:string)=>readFileSync(join(process.cwd(),path),"utf8");

describe("GDELT GAL freshness truth",()=>{
  it("does not refresh last_success_at when no new source file exists",()=>{
    const worker=read("scripts/sync-gdelt-gal-production.mjs");
    const idx=worker.indexOf('if (freshAvailable.length === 0) {');
    expect(idx).toBeGreaterThanOrEqual(0);
    const block=worker.slice(idx, worker.indexOf('const batchSeen',idx));
    expect(block).toContain("last_success_at: cursorRow?.last_success_at ?? null");
    expect(block).toContain("status: healthStatus");
    expect(worker).toContain("FRESH_SUCCESS_WINDOW_SECONDS = 30 * 60");
    expect(worker).toContain("const freshAvailable = available.filter((file) => {");
    expect(worker).toContain("return ageSeconds <= FRESH_SUCCESS_WINDOW_SECONDS;");
    expect(worker).toContain('.select("cursor,last_success_at,consecutive_failures")');
    expect(block).toContain('const failureClass = "UPSTREAM_SOURCE_DELAYED"');
    expect(block).toContain("status: healthStatus");
    expect(block).toContain("consecutive_failures: failures");
    expect(block).toContain("failure_class: failureClass");
    expect(block).toContain('status: "empty"');
    expect(block).not.toContain("last_success_at: nowIso");
    expect(block).toContain('failureClass = "UPSTREAM_SOURCE_DELAYED"');
    expect(block).toContain("consecutive_failures: failures");
  });
});
