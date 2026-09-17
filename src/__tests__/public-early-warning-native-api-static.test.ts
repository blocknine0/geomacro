import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("public Early Warning native API runtime", () => {
  it("serves the canonical feed through a Nitro-native route with opaque failures", () => {
    const route = read("server/api/early-warning.get.ts");

    expect(route).toContain("loadPublicEarlyWarningFeed");
    expect(route).toContain("renderPublicEarlyWarningRss");
    expect(route).toContain('setResponseStatus(event, invalidQuery ? 400 : 503)');
    expect(route).toContain('errorPayload(invalidQuery ? "invalid_query" : "feed_unavailable")');
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).toContain('"Access-Control-Allow-Origin": "*"');
    expect(route).toContain('"X-Content-Type-Options": "nosniff"');

    expect(route).not.toContain("error.message,");
    expect(route).not.toContain("stack:");
    expect(route).not.toContain("service_role");
    expect(route).not.toContain("raw_evidence");
  });

  it("keeps OPTIONS bounded without credentials or external writes", () => {
    const route = read("server/api/early-warning.options.ts");

    expect(route).toContain("setResponseStatus(event, 204)");
    expect(route).toContain('"Access-Control-Allow-Methods": "GET, OPTIONS"');
    expect(route).toContain('"X-Content-Type-Options": "nosniff"');
    expect(route).not.toContain("fetch(");
    expect(route).not.toContain("SUPABASE");
  });
});
