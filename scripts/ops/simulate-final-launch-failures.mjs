#!/usr/bin/env node
import { evaluateFinalLaunchGate } from "./final-launch-gate-core.mjs";

const base = {
  d1: { ok: true, store: "d1", control_plane_role: "primary", schema_version: 1 },
  b2: { ok: true, authority: "backblaze-b2", risk_verification_status: "verified" },
  commerce: {
    ok: true,
    storage: "durable_objects_sqlite",
    exact_response_replay: true,
    duplicate_settlement_rejected: true,
    worker_outage_fails_closed: true,
  },
  supabase: { runtime_mode: "standby", required_for_serving: false, network_attempts: 0 },
  risk_object_trust: {
    ok: true,
    registry_live: true,
    verification_endpoint_live: true,
    active_key: true,
    signature_scheme: "Ed25519",
    canonicalization: "geomacro-canonical-json-v1",
    local_verifier_contract: true,
    tamper_rejected: true,
    b2_risk_verified: true,
    registry_sha256: "a".repeat(64),
  },
  scheduler: { ok: true, fresh: true, fail_closed_on_stale: true },
  exact_head: {
    product_ci: true,
    codeql: true,
    website_lock: true,
    hosting: true,
    x402: true,
    trust: true,
  },
};

const baseline = evaluateFinalLaunchGate(structuredClone(base));
if (!baseline.ready) throw new Error(`BASELINE_GATE_NOT_READY:${baseline.failed.join(",")}`);
if (baseline.real_funds_authorized !== false || baseline.execution_authorized !== false) {
  throw new Error("BASELINE_MUST_NOT_AUTHORIZE_FUNDS_OR_EXECUTION");
}
if (baseline.partner_specific_assurance_required !== false) {
  throw new Error("PARTNER_SPECIFIC_ASSURANCE_MUST_BE_OUTSIDE_LAUNCH_SCOPE");
}

const scenarios = {
  d1_failure(state) { state.d1.ok = false; },
  b2_failure(state) { state.b2.ok = false; },
  risk_object_trust_failure(state) { state.risk_object_trust.registry_live = false; },
  payment_failure(state) { state.commerce.worker_outage_fails_closed = false; },
  signing_failure(state) { state.risk_object_trust.active_key = false; },
  scheduler_failure(state) { state.scheduler.fresh = false; },
};

const results = [];
for (const [name, mutate] of Object.entries(scenarios)) {
  const state = structuredClone(base);
  mutate(state);
  const result = evaluateFinalLaunchGate(state);
  if (result.ready) throw new Error(`${name.toUpperCase()}_DID_NOT_FAIL_CLOSED`);
  if (result.real_funds_authorized !== false || result.execution_authorized !== false) {
    throw new Error(`${name.toUpperCase()}_AUTHORIZED_FUNDS_OR_EXECUTION`);
  }
  results.push({ scenario: name, ready: result.ready, failed: result.failed });
}

const supabasePrimary = structuredClone(base);
supabasePrimary.supabase.runtime_mode = "primary";
const supabaseResult = evaluateFinalLaunchGate(supabasePrimary);
if (supabaseResult.ready || !supabaseResult.failed.includes("supabase_cold_standby")) {
  throw new Error("SUPABASE_PRIMARY_MODE_DID_NOT_FAIL_CLOSED");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.final-launch-failure-simulation.v2",
  baseline_ready: baseline.ready,
  partner_specific_assurance_required: false,
  simulated_failures: results,
  supabase_primary_rejected: true,
  payment_performed: false,
  real_funds_authorized: false,
  execution_authorized: false,
}, null, 2));
