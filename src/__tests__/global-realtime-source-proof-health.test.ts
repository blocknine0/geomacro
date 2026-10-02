import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyRealtimeCorroborateHealth } from "../../scripts/classify-realtime-corroborate-health.mjs";

const workflow = fs.readFileSync(
  ".github/workflows/global-realtime-source-proof.yml",
  "utf8",
);

describe("global realtime source proof health classification", () => {
  it("classifies Supabase egress restriction separately from OIDC rejection", () => {
    const result = classifyRealtimeCorroborateHealth({
      httpStatus: 402,
      transportStatus: 0,
      body: JSON.stringify({
        message:
          "Service for this project is restricted due to the following violations: exceed_egress_quota.",
      }),
    });

    expect(result).toMatchObject({
      ok: false,
      classification: "SUPABASE_PROJECT_SERVICE_RESTRICTED",
      reason: "exceed_egress_quota",
      fail_closed: true,
    });
  });

  it("classifies authorization rejection fail-closed", () => {
    const result = classifyRealtimeCorroborateHealth({
      httpStatus: 401,
      transportStatus: 0,
      body: JSON.stringify({ error: "unauthorized" }),
    });

    expect(result).toMatchObject({
      ok: false,
      classification: "OIDC_AUTHORIZATION_REJECTED",
      reason: "http_401",
      fail_closed: true,
    });
  });

  it("classifies transport failure fail-closed", () => {
    const result = classifyRealtimeCorroborateHealth({
      httpStatus: 0,
      transportStatus: 7,
      body: "",
    });

    expect(result).toMatchObject({
      ok: false,
      classification: "TRANSPORT_FAILURE",
      reason: "curl_exit_7",
      fail_closed: true,
    });
  });

  it("accepts only an authenticated 200 health response", () => {
    const result = classifyRealtimeCorroborateHealth({
      httpStatus: 200,
      transportStatus: 0,
      body: JSON.stringify({ authenticated: true, health: true }),
    });

    expect(result).toMatchObject({
      ok: true,
      classification: "AUTHENTICATED_HEALTHY",
      authenticated: true,
      fail_closed: false,
    });
  });

  it("rejects malformed successful health contracts", () => {
    const result = classifyRealtimeCorroborateHealth({
      httpStatus: 200,
      transportStatus: 0,
      body: JSON.stringify({ health: true }),
    });

    expect(result).toMatchObject({
      ok: false,
      classification: "HEALTH_CONTRACT_INVALID",
      fail_closed: true,
    });
  });

  it("classifies other non-2xx failures without weakening the gate", () => {
    const result = classifyRealtimeCorroborateHealth({
      httpStatus: 500,
      transportStatus: 0,
      body: JSON.stringify({ error: "health_query_failed" }),
    });

    expect(result).toMatchObject({
      ok: false,
      classification: "REALTIME_CORROBORATION_HEALTH_FAILED",
      reason: "http_500",
      fail_closed: true,
    });
  });

  it("keeps machine-readable OIDC and health evidence in the exact-head workflow", () => {
    expect(workflow).toContain('scripts/classify-realtime-corroborate-health.mjs');
    expect(workflow).toContain("Validate scoped OIDC claims");
    expect(workflow).toContain("oidc-claims-summary.json");
    expect(workflow).toContain("realtime-corroborate-health.json");
    expect(workflow).toContain("realtime-corroborate-health-classification.json");
    expect(workflow).toContain("SUPABASE_PROJECT_ID");
  });
});
