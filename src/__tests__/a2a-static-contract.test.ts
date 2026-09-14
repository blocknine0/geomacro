import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const migration = read("supabase/migrations/926_agent_to_agent_network_v1.sql");
const taskRoute = read("server/api/a2a/tasks.post.ts");
const taskStatus = read("server/api/a2a/tasks/[taskId].get.ts");
const identityRoute = read("server/api/a2a/identity.post.ts");
const service = read("src/lib/a2a-service.server.ts");
const signature = read("src/lib/a2a-signature.server.ts");
const callback = read("src/lib/a2a-callback.server.ts");
const outbound = read("src/lib/a2a-outbound.server.ts");
const discovery = read("public/.well-known/geomacro-a2a.json");

describe("A2A production safety contract", () => {
  it("uses durable identities, nonce replay protection, task idempotency and RLS", () => {
    expect(migration).toContain("create table if not exists public.a2a_agent_identities");
    expect(migration).toContain("create table if not exists public.a2a_request_nonces");
    expect(migration).toContain("unique (agent_identity_id, nonce)");
    expect(migration).toContain("unique (principal_id, client_task_id)");
    expect(migration).toContain("alter table public.a2a_tasks enable row level security");
    expect(migration).toContain("revoke all on table public.a2a_tasks from anon, authenticated");
    expect(migration).not.toContain("private_key");
    expect(migration).not.toContain("api_secret");
  });

  it("verifies Ed25519 signatures and consumes one-time nonces before task execution", () => {
    expect(signature).toContain("createPublicKey");
    expect(signature).toContain("verifySignature");
    expect(signature).toContain('from("a2a_request_nonces")');
    expect(signature).toContain("A2A_NONCE_REPLAYED");
    expect(signature).toContain("GEOMACRO_A2A_SIGNATURE_TTL_SECONDS");
    expect(taskRoute.indexOf("verifyA2ASignedRequest")).toBeLessThan(taskRoute.indexOf("getOrCreateA2ATask"));
    expect(taskStatus).toContain("verifyA2ASignedRequest");
  });

  it("keeps commercial entitlement and credit accounting authoritative", () => {
    expect(identityRoute).toContain("authenticateCommercialApiRequest");
    expect(service).toContain("resolveCommercialEntitlementForCapability");
    expect(service).toContain("ensureCommercialCreditAccount");
    expect(service).toContain("consumeCommercialCapability");
    expect(service).toContain('capability: "risk_gate_bundle"');
    expect(service).toContain('access_surface: input.task.payment_mode === "x402_testnet" ? "technical_proof" : "agent_payment"');
  });

  it("persists x402 settlement before risk delivery so retries do not intentionally double-pay", () => {
    expect(migration).toContain("payment_json jsonb");
    expect(taskRoute).toContain("persistedA2AX402Settlement");
    expect(taskRoute).toContain("persistA2AX402Settlement");
    expect(taskRoute.indexOf("persistA2AX402Settlement")).toBeLessThan(taskRoute.indexOf("executeA2ATask"));
    expect(taskRoute).toContain("circleX402PaymentRequiredResponse");
    expect(taskRoute).toContain("circleX402PaymentResponseHeader");
  });

  it("guards callbacks and outbound peer access against arbitrary SSRF targets", () => {
    expect(callback).toContain("GEOMACRO_A2A_CALLBACK_ALLOWLIST");
    expect(callback).toContain("lookup(url.hostname");
    expect(callback).toContain('redirect: "error"');
    expect(callback).toContain("AbortSignal.timeout(4_000)");
    expect(outbound).toContain("GEOMACRO_A2A_OUTBOUND_ALLOWLIST");
    expect(outbound).toContain("GEOMACRO_A2A_OUTBOUND_PRIVATE_KEY_PEM");
    expect(outbound).toContain('redirect: "error"');
    expect(outbound).toContain("does not auto-spend from an unapproved wallet");
  });

  it("publishes discovery and never authorizes downstream execution", () => {
    const manifest = JSON.parse(discovery) as Record<string, any>;
    expect(manifest.protocol.version).toBe("geomacro-a2a/1");
    expect(manifest.endpoints.tasks).toBe("https://geomacro.live/api/a2a/tasks");
    expect(manifest.agent.execution_authorized).toBe(false);
    expect(manifest.boundaries.execution_authorized).toBe(false);
    expect(service).toContain("A2A_RISK_GATE_EXECUTION_BOUNDARY_VIOLATION");
    expect(service).toContain("execution_authorized: false");
  });
});
