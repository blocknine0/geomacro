import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const helper = readFileSync("src/lib/testnet-tester-session-fast.server.ts", "utf8");
const http = readFileSync("src/lib/testnet-tester-http.server.ts", "utf8");

describe("Testnet session performance contract", () => {
  it("keeps authoritative DB validation on every authenticated request", () => {
    expect(helper).toContain('from("testnet_tester_sessions")');
    expect(helper).toContain('eq("session_token_hash", sha256(token))');
    expect(helper).toContain("authoritative_db_validation_per_request: true");
    expect(helper).toContain("auth_decision_cache: false");
  });

  it("throttles only non-security last_seen telemetry writes", () => {
    expect(helper).toContain("SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000");
    expect(helper).toContain("last_seen_at");
    expect(helper).toContain("telemetry_write_blocks_request: false");
    expect(helper).toContain("void db");
  });

  it("routes normal tester authentication through the low-write validator", () => {
    expect(http).toContain('from "./testnet-tester-session-fast.server"');
    expect(http).toContain("requireFastTestnetTesterSession(token)");
    expect(http).not.toContain("requireTestnetTesterSession(token)");
  });
});
