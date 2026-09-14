import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("src/lib/a2a-client.server.ts", "utf8");
const security = readFileSync("src/lib/a2a-security.server.ts", "utf8");

describe("Geomacro outbound A2A client", () => {
  it("discovers the standard Agent Card and requires JSON-RPC v1.0", () => {
    expect(client).toContain("/.well-known/agent-card.json");
    expect(client).toContain('row.protocolBinding === "JSONRPC"');
    expect(client).toContain('row.protocolVersion === A2A_PROTOCOL_VERSION');
    expect(client).toContain('method: "SendMessage"');
    expect(client).toContain('method: "GetTask"');
  });

  it("does not expose arbitrary remote credentials or redirects", () => {
    expect(client).toContain("a2aRemoteAllowedOrigins");
    expect(client).toContain("a2aRemoteBearerForOrigin");
    expect(security).toContain('redirect: "error"');
    expect(security).toContain("GEOMACRO_A2A_REMOTE_ORIGINS");
    expect(security).toContain("GEOMACRO_A2A_REMOTE_AUTH_JSON");
  });

  it("audits outbound card and response hashes", () => {
    expect(client).toContain("recordA2AOutboundInteraction");
    expect(client).toContain("cardSha256");
    expect(client).toContain("responseSha256");
  });
});
