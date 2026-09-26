import fs from "node:fs";
import { describe, expect, it } from "vitest";

const mesh = fs.readFileSync("scripts/sync-open-live-source-mesh.mjs", "utf8");

describe("open live source mesh empty-cycle heartbeat", () => {
  it("marks a successful duplicate-only poll healthy before returning", () => {
    const emptyBranch = mesh.slice(
      mesh.indexOf('if (!accepted.length)'),
      mesh.indexOf('const payload = Buffer.from'),
    );
    expect(emptyBranch).toContain('status: "healthy"');
    expect(emptyBranch).toContain('last_success_at: now');
    expect(emptyBranch).toContain('consecutive_failures: 0');
    expect(emptyBranch).toContain('onConflict: "source_key,stream_key"');
  });

  it("keeps persistence failures fail-closed on an empty cycle", () => {
    const emptyBranch = mesh.slice(
      mesh.indexOf('if (!accepted.length)'),
      mesh.indexOf('const payload = Buffer.from'),
    );
    expect(emptyBranch).toContain("if (emptyRunError) throw emptyRunError");
    expect(emptyBranch).toContain("if (emptyCursorError) throw emptyCursorError");
  });

  it("does not fabricate a new last item timestamp on an empty cycle", () => {
    const emptyBranch = mesh.slice(
      mesh.indexOf('if (!accepted.length)'),
      mesh.indexOf('const payload = Buffer.from'),
    );
    expect(emptyBranch).not.toContain('last_item_at:');
  });
});
