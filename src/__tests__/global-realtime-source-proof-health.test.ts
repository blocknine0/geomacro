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

  it("uses machine-readable direct-Postgres corroboration evidence in the exact-head workflow", () => {
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain("scripts/run-live-flash-corroborate-local.ts");
    expect(workflow).toContain("realtime-corroborate-direct.json");
    expect(workflow).toContain('local_canonical_corroboration_direct_postgres');
    expect(workflow).toContain(".threshold_weakening == false");
    expect(workflow).not.toContain("Validate scoped OIDC claims");
    expect(workflow).not.toContain("oidc-claims-summary.json");
    expect(workflow).not.toContain(".supabase.co/functions/v1/live-flash-corroborate");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain("LIVE_STRUCTURE_EXECUTION_MODE: local_direct_postgres");
    expect(workflow).toContain("B2_S3_ENDPOINT: https://s3.us-east-005.backblazeb2.com");
    expect(workflow).toContain("B2_KEY_ID: ${{ secrets.B2_KEY_ID }}");
    expect(workflow).toContain("B2_APPLICATION_KEY: ${{ secrets.B2_APPLICATION_KEY }}");
    expect(workflow).toContain('export COUNTRY_RAW_SOURCE_SYNC_OUTPUT="country-raw-source-acceptance-${category}.json"');
    expect(workflow).toContain('export COUNTRY_RAW_SOURCE_SYNC_OUTPUT="country-raw-source-final-${category}.json"');
    expect(workflow).toContain("drain-live-structure.mjs --fragment-ids-file");
    expect(workflow).not.toContain("Prove production private B2 archive reader");
  });
});
