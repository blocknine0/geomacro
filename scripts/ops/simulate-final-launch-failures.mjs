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
  partner: {
    ok: true,
    local_gates_passed: true,
    signed_proof_present: true,
    independent_proof_verification: true,
    allowance_used: 1,
    allowance_max: 1,
  },
  signing: {
    signature_valid: true,
    active_key: true,
    fresh: true,
    tamper_rejected: true,
    record_sha256: "a".repeat(64),
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

const scenarios = {
  d1_failure(state) { state.d1.ok = false; },
  b2_failure(state) { state.b2.ok = false; },
  partner_failure(state) { state.partner.signed_proof_present = false; },
  payment_failure(state) { state.commerce.worker_outage_fails_closed = false; },
  signing_failure(state) { state.signing.signature_valid = false; },
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
  schema: "geomacro.final-launch-failure-simulation.v1",
  baseline_ready: baseline.ready,
  simulated_failures: results,
  supabase_primary_rejected: true,
  payment_performed: false,
  real_funds_authorized: false,
  execution_authorized: false,
}, null, 2));
