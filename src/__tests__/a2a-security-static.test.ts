import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("A2A security and durability static contract", () => {
  it("keeps A2A state service-role-only and forward-only", () => {
    const migration = read("supabase/migrations/926_a2a_v1_agent_network.sql");
    for (const table of [
      "a2a_tasks",
      "a2a_messages",
      "a2a_push_notification_configs",
      "a2a_audit_events",
    ]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`GRANT ALL ON public.${table} TO service_role`);
    }
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("requires authenticated commercial principals for task methods", () => {
    const route = read("server/api/a2a/[...path].ts");
    expect(route).toContain("authenticateCommercialApiRequest");
    expect(route).toContain('path === "message:send"');
    expect(route).toContain('path === "tasks"');
    expect(route).toContain("pushNotificationConfigs");
    expect(route).toContain('path === "extendedAgentCard"');
    expect(route).toContain('"A2A-Version"');
  });

  it("never turns Geomacro into an arbitrary outbound HTTP proxy", () => {
    const client = read("src/lib/a2a-client.server.ts");
    const outbound = read("server/api/a2a/outbound.post.ts");
    expect(client).toContain("GEOMACRO_A2A_TRUSTED_PEERS_JSON");
    expect(client).toContain("allowed_interface_hosts");
    expect(client).toContain("assertA2APublicHttpsUrl");
    expect(outbound).toContain("arbitrary_target_urls_allowed: false");
    expect(client).not.toContain("request.target_url");
    expect(client).not.toContain("request.url");
  });

  it("does not persist remote Authorization credentials and fail-closes execution", () => {
    const migration = read("supabase/migrations/926_a2a_v1_agent_network.sql");
    const service = read("src/lib/a2a-service.server.ts");
    const client = read("src/lib/a2a-client.server.ts");
    expect(migration).toContain("never stores remote Authorization credentials");
    expect(service).toContain("A2A_PUSH_AUTHENTICATION_NOT_SUPPORTED");
    expect(service).toContain("A2A_EXECUTION_BOUNDARY_VIOLATION");
    expect(service).toContain("execution_authorized: false");
    expect(client).toContain("remote_authorization_secret_persisted: false");
  });

  it("pins callbacks and peer discovery to public HTTPS with no redirects", () => {
    const safety = read("src/lib/a2a-network-safety.server.ts");
    expect(safety).toContain('url.protocol !== "https:"');
    expect(safety).toContain('redirect: "manual"');
    expect(safety).toContain("169.254.169.254");
    expect(safety).toContain('hostname.endsWith(".internal")');
    expect(safety).toContain("lookup(hostname, { all: true, verbatim: true })");
  });
});
