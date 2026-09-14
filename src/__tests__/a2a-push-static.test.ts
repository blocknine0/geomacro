import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const push = readFileSync("src/lib/a2a-push.server.ts", "utf8");
const security = readFileSync("src/lib/a2a-security.server.ts", "utf8");

describe("A2A push notification hardening", () => {
  it("uses exact-origin allowlists, DNS checks, no redirects and bounded retries", () => {
    expect(push).toContain("a2aPushAllowedOrigins");
    expect(push).toContain("validateA2AEndpointUrl");
    expect(push).toContain("attempt <= 3");
    expect(push).toContain("timeoutMs: 2_500");
    expect(security).toContain("assertA2ADnsPublic");
    expect(security).toContain('redirect: "error"');
  });

  it("rejects inline callback credentials and resolves bearer auth only server-side", () => {
    expect(push).toContain("A2A_PUSH_INLINE_CREDENTIALS_FORBIDDEN");
    expect(push).toContain("a2aPushBearerForOrigin");
    expect(security).toContain("GEOMACRO_A2A_PUSH_BEARER_BY_ORIGIN_JSON");
  });
});
