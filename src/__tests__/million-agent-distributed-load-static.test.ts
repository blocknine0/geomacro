import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workload = readFileSync("scripts/scale/risk-gate-million-agent.k6.js", "utf8");
const planner = readFileSync("scripts/scale/generate-million-agent-load-plan.mjs", "utf8");
const validator = readFileSync("scripts/scale/validate-million-agent-distributed-results.mjs", "utf8");
const workflow = readFileSync(".github/workflows/million-agent-distributed-load-contract.yml", "utf8");
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
  });

  it("keeps CI no-traffic and documents real staging prerequisites", () => {
    expect(workflow).toContain("Network load performed by this workflow: false");
    expect(workflow).toContain("Generate canonical no-traffic 1M-at-40k plan");
    expect(workflow).toContain("Generate canonical no-traffic 40k five-minute soak plan");
    expect(workflow).not.toContain("k6 run scripts/scale/risk-gate-million-agent.k6.js");
    expect(docs).toContain("40,000 requests/second");
    expect(docs).toContain("12,000,000 authenticated Risk Gate requests");
    expect(docs).toContain("must never target `geomacro.live` or `www.geomacro.live`");
    expect(docs).toContain("PENDING DISTRIBUTED STAGING EXECUTION");
  });
});
