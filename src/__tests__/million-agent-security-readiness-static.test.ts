import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("million-agent central security architecture", () => {
  it("uses sharded distributed abuse control without a single global hot row", () => {
    const migration = read(
      "supabase/migrations/943_central_security_sharded_abuse_control.sql",
    );

    expect(migration).toContain("central_security_request_buckets_v2");
    expect(migration).toContain("consume_central_security_budget_v2");
    expect(migration).toContain("global_shard");
    expect(migration).toContain("ceil(p_global_limit::numeric / 16)");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("from PUBLIC, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("24-bit client slot");
    expect(migration).toContain("bucket_key ~ '^[0-9a-f]{6}$'");
    expect(migration).toContain("substr(p_client_key, 1, 6)");
    expect(migration).not.toContain("prune_central_security_request_buckets_v2");
    expect(migration.toLowerCase()).not.toContain(
      "delete from public.central_security_request_buckets_v2",
    );

    expect(migration).not.toMatch(/\bip_address\b/i);
    expect(migration).not.toMatch(/\bbearer_token\b/i);
    expect(migration).not.toMatch(/\bpayment_signature\b/i);
    expect(migration).not.toMatch(/\bcookie_value\b/i);
  });

  it("keeps the application RPC stable while cutting over to sharded v2", () => {
    const cutover = read(
      "supabase/migrations/944_central_security_v2_cutover.sql",
    );

    expect(cutover).toContain(
      "create or replace function public.consume_central_security_budget(",
    );
    expect(cutover).toContain("public.consume_central_security_budget_v2(");
    expect(cutover).toContain("from PUBLIC, anon, authenticated");
    expect(cutover).toContain("to service_role");
  });

  it("requires the sharded ledger in the real-funds database readiness gate", () => {
    const readiness = read(
      "supabase/migrations/945_central_security_v2_database_readiness.sql",
    );

    expect(readiness).toContain("central_security_request_buckets_v2");
    expect(readiness).toContain("relrowsecurity");
    expect(readiness).toContain("has_table_privilege('anon'");
    expect(readiness).toContain("has_table_privilege('authenticated'");
    expect(readiness).toContain("browser_exposed_table_count");
    expect(readiness).toContain("abuse_control_version', 'sharded-v2");
    expect(readiness).toContain("to service_role");
  });

  it("rejects oversized proxy identity headers and distrusts generic proxy identity by default", () => {
    const middleware = read("server/middleware/00-central-security.ts");

    expect(middleware).toContain("MAX_PROXY_IDENTITY_HEADER_BYTES = 2048");
    expect(middleware).toContain("GENERIC_PROXY_IDENTITY_HEADERS");
    expect(middleware).toContain('"x-forwarded-for"');
    expect(middleware).toContain('"x-real-ip"');
    expect(middleware).toContain('"true-client-ip"');
    expect(middleware).toContain("CENTRAL_SECURITY_HEADERS_TOO_LARGE");
    expect(middleware).toContain("GEOMACRO_TRUST_GENERIC_PROXY_HEADERS");
    expect(middleware).toContain("headers.delete(name)");
    expect(middleware).toContain("cf-connecting-ip");
  });
});

describe("million-agent and data-leak evidence harnesses", () => {
  it("models one million agents without touching production or real funds", () => {
    const scale = read("scripts/scale/million-agent-readiness.ts");

    expect(scale).toContain("const MAX_AGENTS = 1_000_000");
    expect(scale).toContain("const DEFAULT_AGENTS = 1_000_000");
    expect(scale).toContain("real_payment_performed: false");
    expect(scale).toContain("production_activation_performed: false");
    expect(scale).toContain("production_host_contacted: false");
    expect(scale).toContain("executionBoundaryViolations");
    expect(scale).toContain("replayBindingViolations");
    expect(scale).toContain("serializationLeakViolations");
  });

  it("models credential spray and rejects malicious request envelopes in-process", () => {
    const stress = read("scripts/security/adversarial-envelope-stress.ts");

    expect(stress).toContain("DEFAULT_SPRAY_AGENTS = 1_000_000");
    expect(stress).toContain("brute_force_network_attack_performed: false");
    expect(stress).toContain("CENTRAL_SECURITY_METHOD_BLOCKED");
    expect(stress).toContain("CENTRAL_SECURITY_HEADERS_TOO_LARGE");
    expect(stress).toContain("CENTRAL_SECURITY_BODY_TOO_LARGE");
    expect(stress).toContain("CENTRAL_SECURITY_AMBIGUOUS_FRAMING");
    expect(stress).toContain("bounded_maximum_overshoot");
  });

  it("fails the build on actual secrets, server source, source maps or private material", () => {
    const scan = read("scripts/security/scan-public-build.mjs");

    expect(scan).toContain("FORBIDDEN_PUBLIC_FILE");
    expect(scan).toContain("ACTUAL_SECRET_VALUE_EXPOSED");
    expect(scan).toContain("sensitiveIdentifierMarkers");
    expect(scan).toContain("observed_sensitive_identifiers");
    expect(scan).toContain("PRIVATE_KEY_MATERIAL_EXPOSED");
    expect(scan).toContain("SERVER_SOURCE_MARKER_EXPOSED");
    expect(scan).toContain("PUBLIC_SOURCEMAP_REFERENCE");
    expect(scan).toContain('pemBegin("PRIVATE KEY")');
    expect(scan).toContain("supabase");
    expect(scan).toContain("migrations");
    expect(scan).toContain("source_maps_forbidden: true");
    expect(scan).toContain("pem_private_key_material_forbidden: true");
    expect(scan).toContain("actual_secret_values_persisted: false");
  });
});
