export function evaluateFinalLaunchGate(state) {
  const checks = {
    d1_primary_control_plane:
      state?.d1?.ok === true &&
      state?.d1?.store === "d1" &&
      state?.d1?.control_plane_role === "primary" &&
      Number(state?.d1?.schema_version ?? 0) >= 1,
    b2_durable_authority:
      state?.b2?.ok === true &&
      state?.b2?.authority === "backblaze-b2" &&
      state?.b2?.risk_verification_status === "verified",
    durable_object_commerce:
      state?.commerce?.ok === true &&
      state?.commerce?.storage === "durable_objects_sqlite" &&
      state?.commerce?.exact_response_replay === true &&
      state?.commerce?.duplicate_settlement_rejected === true &&
      state?.commerce?.worker_outage_fails_closed === true,
    supabase_cold_standby:
      state?.supabase?.runtime_mode === "standby" &&
      state?.supabase?.required_for_serving === false &&
      state?.supabase?.network_attempts === 0,
    risk_object_trust:
      state?.risk_object_trust?.ok === true &&
      state?.risk_object_trust?.registry_live === true &&
      state?.risk_object_trust?.verification_endpoint_live === true &&
      state?.risk_object_trust?.active_key === true &&
      state?.risk_object_trust?.signature_scheme === "Ed25519" &&
      state?.risk_object_trust?.canonicalization === "geomacro-canonical-json-v1" &&
      state?.risk_object_trust?.local_verifier_contract === true &&
      state?.risk_object_trust?.tamper_rejected === true &&
      state?.risk_object_trust?.b2_risk_verified === true &&
      /^[0-9a-f]{64}$/.test(String(state?.risk_object_trust?.registry_sha256 ?? "")),
    scheduler_health:
      state?.scheduler?.ok === true &&
      state?.scheduler?.fresh === true &&
      state?.scheduler?.fail_closed_on_stale === true,
    exact_head_gates:
      state?.exact_head?.product_ci === true &&
      state?.exact_head?.codeql === true &&
      state?.exact_head?.website_lock === true &&
      state?.exact_head?.hosting === true &&
      state?.exact_head?.x402 === true &&
      state?.exact_head?.trust === true,
  };

  const failed = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([name]) => name);

  return {
    schema: "geomacro.final-commercial-launch-gate.v2",
    ready: failed.length === 0,
    checks,
    failed,
    production_data_authority: "backblaze-b2",
    compact_control_plane: "cloudflare-d1",
    commerce_authority: "cloudflare-durable-objects",
    supabase_runtime_mode: "standby",
    risk_object_trust_scope: "generic-public-production",
    partner_specific_assurance_required: false,
    supabase_destructive_retirement_authorized: false,
    payment_performed: false,
    real_funds_authorized: false,
    execution_authorized: false,
  };
}
