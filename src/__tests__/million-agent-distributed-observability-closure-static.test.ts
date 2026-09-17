import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/million-agent-distributed-observability-closure.yml",
  "utf8",
);
const telemetry = readFileSync(
  "scripts/scale/validate-distributed-capacity-telemetry.mjs",
  "utf8",
);
const control = readFileSync(
  "scripts/scale/probe-distributed-staging-control-plane.mjs",
  "utf8",
);

describe("distributed 40k observability closure", () => {
  it("runs only after a successful real staging capacity workflow and binds source artifacts", () => {
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("Distributed 40k Staging Execution");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(workflow).toContain("github.event.workflow_run.head_sha");
    expect(workflow).toContain("distributed-40k-capacity-pass-*");
    expect(workflow).toContain("distributed-40k-validation-million_burst_40k.json");
    expect(workflow).toContain("distributed-40k-validation-soak_40k_5m.json");
  });

  it("requires observed infrastructure health and a source-audited provider-path saturation basis", () => {
    expect(workflow).toContain("geomacro-capacity-observer");
    expect(workflow).toContain("/opt/geomacro/bin/export-capacity-telemetry");
    expect(workflow).toContain("--self-test");
    expect(workflow).toContain("--burst-start-ms");
    expect(workflow).toContain("--soak-start-ms");
    expect(workflow).toContain("validate-distributed-capacity-telemetry.mjs");
    expect(telemetry).toContain("db_pool.peak_utilization_ratio");
    expect(telemetry).toContain("db_pool.wait_p95_ms");
    expect(telemetry).toContain("edge_runtime.cpu_peak_ratio");
    expect(telemetry).toContain("edge_runtime.memory_peak_ratio");
    expect(telemetry).toContain("auth_rate_limit.unexpected_rate_limits");
    expect(telemetry).toContain("security.data_leak_events");
    expect(telemetry).toContain("idempotency_replay.duplicate_effects");
    expect(telemetry).toContain("external_model_provider_in_synchronous_request_path");
    expect(telemetry).toContain("not_applicable_to_synchronous_risk_gate_request_path");
    expect(telemetry).toContain("provider_saturation_gate_basis: 'not_applicable_source_audited'");
  });

  it("proves auth and idempotency/replay after the load on the same staging release", () => {
    expect(workflow).toContain("probe-distributed-staging-control-plane.mjs");
    expect(control).toContain("production Geomacro host is forbidden");
    expect(control).toContain("missing-auth request expected 401/403");
    expect(control).toContain("invalid-auth request expected 401/403");
    expect(control).toContain("x-geomacro-idempotent-replay");
    expect(control).toContain("IDEMPOTENCY_CONFLICT");
    expect(control).toContain("execution_authorized");
  });

  it("produces one digest-bound final closure without activating production or mainnet", () => {
    expect(workflow).toContain("geomacro.distributed-40k-capacity-closure.v1");
    expect(workflow).toContain("evidence_sha256");
    expect(workflow).toContain("db_pool_capacity_pass: true");
    expect(workflow).toContain("edge_runtime_capacity_pass: true");
    expect(workflow).toContain("provider_saturation_pass: true");
    expect(workflow).toContain("data_leakage_gate_pass: true");
    expect(workflow).toContain("idempotency_replay_conflict_pass: true");
    expect(workflow).toContain("production_load: false");
    expect(workflow).toContain("real_payment: false");
    expect(workflow).toContain("mainnet_activation: false");
  });
});
