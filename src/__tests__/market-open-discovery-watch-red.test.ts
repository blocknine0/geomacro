import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { discoveryMonitorExitCode } from "../../scripts/ops/probe-market-signal-discovery.mjs";

const categories = ["geopolitics", "macro", "rare_earth"] as const;
const healthy = () => ({
  source_reachability: "ALL_POLL_OK",
  categories: categories.map((category) => ({
    category, source_transport_ok: true, source_failure_reason: null,
    publicly_scored: false, chargeable: false,
  })),
});

describe("#1827 market signal cron operational truth", () => {
  it("keeps a fully reached three-domain probe green without declaring commercial readiness", () => {
    const receipt = healthy();
    expect(discoveryMonitorExitCode(receipt)).toBe(0);
    expect(receipt.categories.every((row) => !row.chargeable && !row.publicly_scored)).toBe(true);
  });

  it("goes red for the observed 429 on geopolitical and budget-held other domains", () => {
    const receipt = healthy();
    receipt.source_reachability = "DEGRADED";
    receipt.categories[0].source_transport_ok = false;
    receipt.categories[0].source_failure_reason = "HTTP_429";
    receipt.categories[1].source_transport_ok = false;
    receipt.categories[1].source_failure_reason = "UPSTREAM_RATE_LIMIT_BACKOFF";
    receipt.categories[2].source_transport_ok = false;
    receipt.categories[2].source_failure_reason = "UPSTREAM_RATE_LIMIT_BACKOFF";
    expect(discoveryMonitorExitCode(receipt)).toBe(1);
  });

  it("goes red for a falsely green aggregate, absent third category, or substituted category", () => {
    const receipt = healthy();
    receipt.categories[2].source_transport_ok = false;
    expect(discoveryMonitorExitCode(receipt)).toBe(1);
    expect(discoveryMonitorExitCode({ ...healthy(), categories: healthy().categories.slice(0, 2) })).toBe(1);
    expect(discoveryMonitorExitCode(null)).toBe(1);
    expect(discoveryMonitorExitCode({ ...healthy(), categories: [
      healthy().categories[0], healthy().categories[1], healthy().categories[1],
    ] })).toBe(1);
  });

  it("retains bounded aggregates even when the polling step fails", () => {
    const workflow = readFileSync(".github/workflows/global-open-signal-monitor.yml", "utf8");
    const script = readFileSync("scripts/ops/probe-market-signal-discovery.mjs", "utf8");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("three-domain-signal-receipt.json");
    expect(script).toContain("writeFileSync(MARKET_SIGNAL_ARTIFACT");
    expect(script).toContain("process.exitCode = 1");
    expect(script).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
