import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const k6 = readFileSync("scripts/scale/risk-gate-million-agent.k6.js", "utf8");
const resultValidator = readFileSync("scripts/scale/validate-million-agent-distributed-results.mjs", "utf8");
const telemetryValidator = readFileSync("scripts/scale/validate-distributed-capacity-telemetry.mjs", "utf8");
const telemetryFetcher = readFileSync("scripts/scale/fetch-distributed-capacity-telemetry.mjs", "utf8");
const providerAudit = readFileSync("scripts/scale/audit-risk-gate-provider-path.mjs", "utf8");
const controlProbe = readFileSync("scripts/scale/probe-distributed-staging-control-plane.mjs", "utf8");
const evidenceClosure = readFileSync(".github/workflows/distributed-40k-evidence-closure.yml", "utf8");
const strictClosure = readFileSync(".github/workflows/strict-commercial-launch-closure.yml", "utf8");
const liveData = readFileSync("scripts/ops/live-data-reliability-smoke.mjs", "utf8");

describe("P0 exact-candidate launch closure", () => {
  it("records real load failure classes and synchronized first-request timing", () => {
    for (const token of [
      "server_5xx_responses",
      "transport_errors",
      "auth_failures",
      "rate_limit_responses",
      "first_request_start_offset_ms",
    ]) expect(k6).toContain(token);
    for (const token of [
      "zero_server_5xx_responses",
      "zero_transport_errors_or_timeouts",
      "zero_auth_failures",
      "zero_rate_limit_responses",
      "maximum_first_request_start_offset_ms",
    ]) expect(resultValidator).toContain(token);
  });

  it("requires authenticated full-window DB and edge/runtime telemetry rather than inferred health", () => {
    expect(telemetryFetcher).toContain("RISK_GATE_DISTRIBUTED_TELEMETRY_TOKEN");
    expect(telemetryFetcher).toContain("Production Geomacro host cannot be the staging telemetry collector");
    expect(telemetryValidator).toContain("full_window_covered");
    expect(telemetryValidator).toContain("db_pool.peak_utilization_ratio");
    expect(telemetryValidator).toContain("db_pool.wait_p95_ms");
    expect(telemetryValidator).toContain("edge_runtime.cpu_peak_ratio");
    expect(telemetryValidator).toContain("edge_runtime.memory_peak_ratio");
    expect(telemetryValidator).toContain("authenticated_query");
    expect(evidenceClosure).toContain("no inferred capacity pass is allowed");
  });

  it("proves replay/idempotency after load and keeps execution non-authorizing", () => {
    expect(controlProbe).toContain("X-Geomacro-Idempotent-Replay");
    expect(controlProbe).toContain("IDEMPOTENCY_CONFLICT");
    expect(controlProbe).toContain("missing_auth_rejected");
    expect(controlProbe).toContain("execution_authorized: false");
    expect(evidenceClosure).toContain("post-load idempotency/replay/conflict");
  });

  it("treats external model-provider saturation as N/A only after a source-bound request-path audit", () => {
    expect(providerAudit).toContain("external_model_provider_in_synchronous_request_path: false");
    expect(providerAudit).toContain("not_applicable_to_synchronous_risk_gate_request_path");
    expect(providerAudit).toContain("audited_sources");
    expect(providerAudit).toContain("No outbound HTTP request occurs in this wrapper.");
    expect(evidenceClosure).toContain("risk-gate-provider-path-audit.json");
  });

  it("binds burst, soak, telemetry and control evidence to one exact candidate and deployment", () => {
    expect(evidenceClosure).toContain("distributed-40k-validation-million_burst_40k.json");
    expect(evidenceClosure).toContain("distributed-40k-validation-soak_40k_5m.json");
    expect(evidenceClosure).toContain("distributed-40k-infra-telemetry-validation.json");
    expect(evidenceClosure).toContain("distributed-40k-control-plane-proof.json");
    expect(evidenceClosure).toContain("geomacro.distributed-40k-launch-evidence-closure.v1");
    expect(evidenceClosure).toContain("requests:1000000,rps:40000,duration_seconds:25");
    expect(evidenceClosure).toContain("requests:12000000,rps:40000,duration_seconds:300");
  });

  it("makes strict commercial closure parse the real evidence and re-check exact live data health", () => {
    expect(strictClosure).toContain("distributed_evidence_run_id");
    expect(strictClosure).toContain("distributed-40k-launch-evidence-closure.json");
    expect(strictClosure).toContain("zero_5xx");
    expect(strictClosure).toContain("DB pool proof failed");
    expect(strictClosure).toContain("idempotency/replay proof failed");
    expect(strictClosure).toContain("live-data-reliability-smoke.mjs");
    expect(strictClosure).toContain("Strict Commercial Launch Closure: PASS");
  });

  it("requires authoritative public data paths to be healthy at launch closure", () => {
    expect(liveData).toContain("/institutional");
    expect(liveData).toContain("/global-risk");
    expect(liveData).toContain("/intelligence");
    expect(liveData).toContain("public-risk-indices");
    expect(liveData).toContain("public-early-warning");
    expect(liveData).toContain("warning?.degraded === false");
    expect(liveData).toContain("row?.status === 'available'");
    expect(liveData).toContain("canonical_main_sha");
  });
});
