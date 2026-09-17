import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workload = readFileSync("scripts/scale/risk-gate-million-agent.k6.js", "utf8");
const planner = readFileSync("scripts/scale/generate-million-agent-load-plan.mjs", "utf8");
const validator = readFileSync("scripts/scale/validate-million-agent-distributed-results.mjs", "utf8");
const shardRunner = readFileSync("scripts/scale/run-million-agent-distributed-shard.mjs", "utf8");
const fleetBarrier = readFileSync("scripts/scale/wait-for-distributed-generator-fleet.mjs", "utf8");
const contractWorkflow = readFileSync(".github/workflows/million-agent-distributed-load-contract.yml", "utf8");
const executionWorkflow = readFileSync(".github/workflows/million-agent-distributed-staging-execution.yml", "utf8");
const docs = readFileSync("docs/MILLION_AGENT_DISTRIBUTED_LOAD.md", "utf8");

describe("40k distributed load contract", () => {
  it("hard-blocks production and preserves normal auth/abuse controls", () => {
    expect(workload).toContain("geomacro.live");
    expect(workload).toContain("www.geomacro.live");
    expect(workload).toContain("Production Geomacro host is forbidden for distributed load");
    expect(workload).toContain("I_AUTHORIZE_DISTRIBUTED_ISOLATED_STAGING_LOAD");
    expect(workload).toContain("I_CONFIRMED_STAGING_CAPACITY_AND_QUOTAS");
    expect(workload).toContain("RISK_GATE_DISTRIBUTED_API_KEYS_JSON");
    expect(workload).toContain("RISK_GATE_DISTRIBUTED_MAX_RATE_PER_CLIENT");
    expect(workload).toContain("API key pool is too small for normal per-client rate controls");
    expect(workload).toContain("auth_and_abuse_controls_bypassed: false");
    expect(workload).toContain("maxRedirects: 0");
    expect(workload).toContain("redirects: 0");
    expect(executionWorkflow).toContain("staging-capacity");
    expect(executionWorkflow).not.toContain("https://geomacro.live/api/risk-gate");
  });

  it("enforces zero-leak response and latency gates", () => {
    expect(workload).toContain("response_security_violations: ['count==0']");
    expect(workload).toContain("execution_boundary_violations: ['count==0']");
    expect(workload).toContain("response_header_violations: ['count==0']");
    expect(workload).toContain("oversized_responses: ['count==0']");
    expect(workload).toContain("dropped_iterations: ['count==0']");
    expect(workload).toContain("selected API key is not echoed");
    expect(workload).toContain("sensitive keys are not exposed");
    expect(workload).toContain("response body remains bounded");
    expect(workload).toContain("security response headers remain intact");
    expect(workload).toContain("cacheControl.includes('no-store')");
    expect(workload).toContain("nosniff === 'nosniff'");
    expect(workload).toContain("!setCookie");
    expect(planner).toContain("const P95_MAX_MS = 1_500");
    expect(planner).toContain("const P99_MAX_MS = 3_000");
  });

  it("defines both exact 40k profiles", () => {
    expect(planner).toContain("million_burst_40k");
    expect(planner).toContain("soak_40k_5m");
    expect(planner).toContain("totalAgents: 1_000_000");
    expect(planner).toContain("totalAgents: 12_000_000");
    expect(planner).toContain("aggregateRate: 40_000");
    expect(planner).toContain("durationSeconds: 25");
    expect(planner).toContain("durationSeconds: 300");
    expect(planner).toContain("shards: 40");
    expect(validator).toContain("expectedRate: 40_000");
    expect(validator).toContain("auth_and_abuse_controls_bypassed !== false");
    expect(executionWorkflow).toContain("1,000,000 authenticated requests at 40,000 req/s for 25 seconds: PASS");
    expect(executionWorkflow).toContain("12,000,000 authenticated requests at 40,000 req/s for 5 minutes: PASS");
  });

  it("binds every real shard to the exact release, staging marker and synchronized run", () => {
    expect(shardRunner).toContain("/.well-known/geomacro-build.json");
    expect(shardRunner).toContain("canonical_main_sha");
    expect(shardRunner).toContain("Checked-out SHA");
    expect(shardRunner).toContain("--preflight-only");
    expect(workload).toContain("candidate_sha: candidateSha");
    expect(workload).toContain("verified_staging_sha: verifiedStagingSha");
    expect(workload).toContain("deployment_id: deploymentId");
    expect(workload).toContain("run_group_id: runGroupId");
    expect(workload).toContain("generator_launch_offset_ms: launchOffsetMs");
    expect(validator).toContain("Shard candidate SHA mismatch");
    expect(validator).toContain("Shard deployment ID mismatch");
    expect(validator).toContain("Shard run-group ID mismatch");
    expect(validator).toContain("Duplicate generator ID");
    expect(validator).toContain("Generator launch skew");
    expect(validator).toContain("synchronized_generator_barrier: true");
  });

  it("requires 40 occupied self-hosted generator slots before any real traffic", () => {
    expect(executionWorkflow).toContain("runs-on: [self-hosted, linux, x64, geomacro-load-generator]");
    expect(executionWorkflow).toContain("max-parallel: 40");
    expect(executionWorkflow).toContain("Publish occupied generator readiness");
    expect(executionWorkflow).toContain("Require all 40 generator slots ready before fire window");
    expect(fleetBarrier).toContain("EXPECTED_GENERATORS = 40");
    expect(fleetBarrier).toContain("refusing traffic");
    expect(fleetBarrier).toContain("shardIds.size === EXPECTED_GENERATORS");
    expect(shardRunner).toContain("Generator missed synchronized barrier");
    expect(executionWorkflow).toContain("needs: validate-burst");
    expect(executionWorkflow).toContain("soak-preflight");
  });

  it("keeps ordinary CI no-traffic while providing a separately manual real execution path", () => {
    expect(contractWorkflow).toContain("Network load performed by this workflow: false");
    expect(contractWorkflow).toContain("Generate canonical no-traffic 1M-at-40k plan");
    expect(contractWorkflow).toContain("Generate canonical no-traffic 40k five-minute soak plan");
    expect(contractWorkflow).not.toContain("k6 run scripts/scale/risk-gate-million-agent.k6.js");
    expect(executionWorkflow).toContain("workflow_dispatch:");
    expect(executionWorkflow).not.toContain("pull_request:");
    expect(executionWorkflow).not.toContain("push:");
    expect(executionWorkflow).toContain("I_CONFIRMED_STAGING_CAPACITY_AND_QUOTAS");
    expect(executionWorkflow).toContain("distributed-40k-capacity-pass-");
    expect(executionWorkflow).toContain("Production load / real payment / mainnet activation: false");
  });

  it("documents the difference between ready harness and earned capacity evidence", () => {
    expect(docs).toContain("40,000 requests/second");
    expect(docs).toContain("12,000,000 authenticated Risk Gate requests");
    expect(docs).toContain("must never target `geomacro.live` or `www.geomacro.live`");
    expect(docs).toContain("PENDING DISTRIBUTED STAGING EXECUTION");
    expect(docs).toContain("40 dedicated self-hosted load-generator runner slots");
    expect(docs).toContain("same candidate SHA");
    expect(docs).toContain("does not by itself earn a 40,000 requests/second capacity claim");
  });
});
