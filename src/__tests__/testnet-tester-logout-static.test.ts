import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("testnet tester logout", () => {
  it("revokes the authenticated server session and clears the secure cookie", () => {
    const route = read("server/api/testnet-tester/logout.post.ts");
    const service = read("src/lib/testnet-tester-session-management.server.ts");
    expect(route).toContain("requireTesterPrincipal(event)");
    expect(route).toContain("revokeTestnetTesterSession");
    expect(route).toContain("clearTesterSessionCookie(event)");
    expect(service).toContain('from("testnet_tester_sessions")');
    expect(service).toContain("revoked_at: now");
    expect(service).toContain('.eq("principal_id", input.principalId)');
    expect(service).toContain('.eq("id", input.sessionId)');
  });
});
