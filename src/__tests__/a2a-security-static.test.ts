import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("src/lib/a2a-service.server.ts", "utf8");
const client = readFileSync("src/lib/a2a-client.server.ts", "utf8");
const route = readFileSync("src/routes/api.agent.a2a.ts", "utf8");
const migration = readFileSync("supabase/migrations/926_agent_to_agent_tasks.sql", "utf8");

describe("A2A security invariants", () => {
  it("keeps execution and wallet custody disabled", () => {
    expect(service).toContain("execution_authorized: false");
    expect(client).toContain("does not custody wallets or auto-sign outbound x402 payments");
    expect(route).toContain("execution_authorized: false");
  });

  it("requires registered callback hosts and remote host allowlisting", () => {
    expect(service).toContain("A2A_CALLBACK_HOST_NOT_REGISTERED");
    expect(service).toContain("registration.callback_hosts");
    expect(client).toContain("GEOMACRO_A2A_REMOTE_HOST_ALLOWLIST");
    expect(client).toContain('redirect: "error"');
  });

  it("persists nonce replay protection, idempotency and service-role-only A2A tables", () => {
    expect(migration).toContain("PRIMARY KEY (agent_id, key_id, nonce)");
    expect(migration).toContain("UNIQUE (direction, caller_agent_id, external_task_id)");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON public.a2a_tasks FROM anon, authenticated");
  });

  it("signs responses and callbacks with Ed25519-backed Geomacro signing material", () => {
    expect(service).toContain("signGeomacroA2AValue");
    expect(route).toContain("geomacroA2AManifest");
  });
});
