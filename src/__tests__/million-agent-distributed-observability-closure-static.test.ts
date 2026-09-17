import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/distributed-40k-evidence-closure.yml",
  "utf8",
);
const telemetry = readFileSync(
  "scripts/scale/validate-distributed-capacity-telemetry.mjs",
  "utf8",
);
const telemetryFetcher = readFileSync(
  "scripts/scale/fetch-distributed-capacity-telemetry.mjs",
  "utf8",
);
const control = readFileSync(
  "scripts/scale/probe-distributed-staging-control-plane.mjs",
  "utf8",
);
const providerAudit = readFileSync(
  "scripts/scale/audit-risk-gate-provider-path.mjs",
  "utf8",
);

describe("distributed 40k evidence closure", () => {
  it("binds one successful real staging capacity run to the exact main candidate and deployment", () => {
    expect(workflow).toContain("capacity_run_id:");
    expect(workflow).toContain("candidate_sha:");
    expect(workflow).toContain("deployment_id:");
    expect(workflow).toContain("million-agent-distributed-staging-execution.yml");
    expect(workflow).toContain("run.head_branch !== 'main'");
    expect(workflow).toContain("run.conclusion !== 'success'");
    expect(workflow).toContain("distributed-40k-validation-million_burst_40k.json");
    expect(workflow).toContain("distributed-40k-validation-soak_40k_5m.json");
    expect(workflow).toContain("distributed-40k-capacity-pass.json");
    expect(workflow).toContain("zero_server_5xx_responses");
    expect(workflow).toContain("zero_transport_errors_or_timeouts");
    expect(workflow).toContain("zero_auth_failures");
    expect(workflow).toContain("zero_rate_limit_responses");
  });

  it("requires authenticated full-window DB and edge/runtime telemetry and forbids inferred capacity passes", () => {
    expect(workflow).toContain("fetch-distributed-capacity-telemetry.mjs");
    expect(workflow).toContain("RISK_GATE_DISTRIBUTED_TELEMETRY_TOKEN");
    expect(workflow).toContain("no inferred capacity pass is allowed");
    expect(workflow).toContain("validate-distributed-capacity-telemetry.mjs");
    expect(telemetryFetcher).toContain("Production Geomacro host cannot be the staging telemetry collector");
    expect(telemetry).toContain("full_window_covered");
    expect(telemetry).toContain("db_pool.peak_utilization_ratio");
    expect(telemetry).toContain("db_pool.wait_p95_ms");
    expect(telemetry).toContain("edge_runtime.cpu_peak_ratio");
    expect(telemetry).toContain("edge_runtime.memory_peak_ratio");
    expect(telemetry).toContain("authenticated_query");
  });

  it("proves post-load authentication and idempotency/replay behavior on the same staging release", () => {
    expect(workflow).toContain("probe-distributed-staging-control-plane.mjs");
    expect(workflow).toContain("Prove post-load auth, replay, conflict and response-security controls");
    expect(control).toContain("missing-auth request expected 401/403");
    expect(control).toContain("invalid-auth request expected 401/403");
    expect(control).toContain("x-geomacro-idempotent-replay");
    expect(control).toContain("IDEMPOTENCY_CONFLICT");
    expect(control).toContain("execution_authorized: false");
  });

  it("accepts provider saturation as N/A only from the source-audited synchronous request path", () => {
    expect(workflow).toContain("audit-risk-gate-provider-path.mjs");
    expect(workflow).toContain("risk-gate-provider-path-audit.json");
    expect(providerAudit).toContain("external_model_provider_in_synchronous_request_path: false");
    expect(providerAudit).toContain("not_applicable_to_synchronous_risk_gate_request_path");
    expect(providerAudit).toContain("audited_sources");
    expect(telemetry).toContain("provider_saturation_gate_basis");
    expect(telemetry).toContain("not_applicable_source_audited");
  });

  it("creates one exact-candidate launch evidence closure without production load, payment or mainnet activation", () => {
    expect(workflow).toContain("geomacro.distributed-40k-launch-evidence-closure.v1");
    expect(workflow).toContain("requests:1000000,rps:40000,duration_seconds:25");
    expect(workflow).toContain("requests:12000000,rps:40000,duration_seconds:300");
    expect(workflow).toContain("post_load_control_plane_pass:true");
    expect(workflow).toContain("production_load:false");
    expect(workflow).toContain("real_payment:false");
    expect(workflow).toContain("mainnet_activation:false");
  });
});
