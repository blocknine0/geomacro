import { describe, expect, it } from "vitest";
import {
  AUTHORITATIVE_RISK_PROJECT_REF,
  resolveRiskSupabaseConfig,
} from "@/lib/risk-supabase.server";

const authoritativeUrl = `https://${AUTHORITATIVE_RISK_PROJECT_REF}.supabase.co`;

describe("Risk Supabase runtime resolution", () => {
  it("keeps production standby by default", () => {
    expect(
      resolveRiskSupabaseConfig({
        NODE_ENV: "production",
        APP_SUPABASE_URL: authoritativeUrl,
        APP_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      }),
    ).toBeNull();
  });

  it("allows the authoritative remote project only in explicit primary mode", () => {
    expect(
      resolveRiskSupabaseConfig({
        NODE_ENV: "production",
        GEOMACRO_SUPABASE_RUNTIME_MODE: "primary",
        APP_SUPABASE_URL: authoritativeUrl,
        APP_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      }),
    ).toEqual({
      url: authoritativeUrl,
      key: "service-role-key",
      source: "app-service-role",
    });
  });

  it("rejects arbitrary remote Supabase projects", () => {
    expect(
      resolveRiskSupabaseConfig({
        NODE_ENV: "development",
        GEOMACRO_SUPABASE_RUNTIME_MODE: "primary",
        APP_SUPABASE_URL: "https://wrongproject.supabase.co",
        APP_SUPABASE_SERVICE_ROLE_KEY: "wrong-service-role",
      }),
    ).toBeNull();
  });

  it("allows loopback service-role Supabase only outside production", () => {
    expect(
      resolveRiskSupabaseConfig({
        NODE_ENV: "development",
        GEOMACRO_SUPABASE_RUNTIME_MODE: "primary",
        APP_SUPABASE_URL: "http://127.0.0.1:54321",
        APP_SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
      }),
    ).toEqual({
      url: "http://127.0.0.1:54321",
      key: "local-service-role",
      source: "app-service-role",
    });

    expect(
      resolveRiskSupabaseConfig({
        NODE_ENV: "production",
        GEOMACRO_SUPABASE_RUNTIME_MODE: "primary",
        APP_SUPABASE_URL: "http://127.0.0.1:54321",
        APP_SUPABASE_SERVICE_ROLE_KEY: "local-service-role",
      }),
    ).toBeNull();
  });

  it("never accepts a local anon-only configuration for privileged Risk Gate access", () => {
    expect(
      resolveRiskSupabaseConfig({
        NODE_ENV: "development",
        GEOMACRO_SUPABASE_RUNTIME_MODE: "primary",
        APP_SUPABASE_URL: "http://localhost:54321",
        APP_SUPABASE_ANON_KEY: "local-anon",
      }),
    ).toBeNull();
  });
});
