import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const assurance = JSON.parse(read("config/partner-assurance.v1.json"));
const adapter = read("scripts/partner-assurance-adapter.ts");
const migration = read("workers/control-plane/migrations/0002_primary_runtime_authority.sql");
const finalGate = read("scripts/ops/final-launch-gate-core.mjs");
const simulations = read("scripts/ops/simulate-final-launch-failures.mjs");

describe("Day 6 generic partner assurance", () => {
  it("keeps Federico behind shared cryptographic and evidence thresholds", () => {
    expect(assurance.schema).toBe("geomacro.partner-assurance.v1");
    expect(assurance.core_gates.risk_object_schema).toBe("gro-1.1");
    expect(assurance.core_gates.signature_scheme).toBe("Ed25519");
    expect(assurance.core_gates.canonicalization).toBe("geomacro-canonical-json-v1");
    expect(assurance.core_gates.minimum_independent_source_families).toBeGreaterThanOrEqual(2);
    expect(assurance.core_gates.live_review_after_local_gates_only).toBe(true);
    expect(assurance.core_gates.max_live_reviews_per_run).toBe(1);
    expect(assurance.core_gates.execution_authorized).toBe(false);
    expect(assurance.partners.federico.signed_partner_proof_required).toBe(true);
    expect(assurance.partners.federico.independent_proof_verification_required).toBe(true);
    expect(assurance.partners.federico.live_review_allowance_per_run).toBe(1);
  });

  it("maps a second partner without activating a weaker path", () => {
    expect(assurance.partners.goat.status).toBe("MAPPED_NOT_ACTIVATED");
    expect(assurance.partners.goat.live_review_allowed).toBe(false);
    expect(assurance.partners.goat.live_review_allowance_per_run).toBe(0);
    expect(assurance.partners.goat.note).toContain("core thresholds may not be lowered");
  });

  it("requires local gates before the single live review allowance", () => {
    const localCheck = adapter.indexOf("const deployed = await deployedVerify");
    const liveBlock = adapter.indexOf('if (mode === "live")');
    const providerCall = adapter.indexOf('spawnSync("bun"');
    expect(localCheck).toBeGreaterThan(-1);
    expect(liveBlock).toBeGreaterThan(localCheck);
    expect(providerCall).toBeGreaterThan(liveBlock);
    expect(adapter).toContain("LIVE_REVIEW_ALLOWANCE_NOT_EXPLICITLY_GRANTED");
    expect(adapter).toContain("SIGNED_PARTNER_PROOF_MISSING");
    expect(adapter).toContain("INDEPENDENT_PARTNER_PROOF_VERIFICATION_FAILED");
    expect(adapter).toContain("TAMPER_NOT_REJECTED");
  });
});

describe("Day 7 authority cutover and disaster gate", () => {
  it("makes D1 primary only for compact metadata while preserving B2 and Durable Objects", () => {
    expect(migration).toContain("'runtime_authority'");
    expect(migration).toContain('"role":"primary"');
    expect(migration).toContain('"compact_metadata_only":true');
    expect(migration).toContain('"durable_payload_authority":"backblaze-b2"');
    expect(migration).toContain('"commerce_authority":"cloudflare-durable-objects"');
    expect(migration).toContain('"supabase_runtime_mode":"standby"');
    expect(migration).toContain('"supabase_required_for_serving":false');
  });

  it("requires every final launch authority and keeps real funds disabled", () => {
    for (const marker of [
      "d1_primary_control_plane",
      "b2_durable_authority",
      "durable_object_commerce",
      "supabase_cold_standby",
      "partner_assurance",
      "signing_trust",
      "scheduler_health",
      "exact_head_gates",
    ]) {
      expect(finalGate).toContain(marker);
    }
    expect(finalGate).toContain("supabase_destructive_retirement_authorized: false");
    expect(finalGate).toContain("real_funds_authorized: false");
    expect(finalGate).toContain("execution_authorized: false");
  });

  it("simulates all requested failure classes and requires fail-closed behavior", () => {
    for (const marker of [
      "d1_failure",
      "b2_failure",
      "partner_failure",
      "payment_failure",
      "signing_failure",
      "scheduler_failure",
      "DID_NOT_FAIL_CLOSED",
      "SUPABASE_PRIMARY_MODE_DID_NOT_FAIL_CLOSED",
    ]) {
      expect(simulations).toContain(marker);
    }
  });
});
