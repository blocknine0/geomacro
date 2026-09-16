import { describe, expect, it } from "vitest";
import {
  AUTHORITATIVE_APP_SUPABASE_PROJECT_REF,
  resolveAppSupabaseConfig,
} from "@/lib/supabase-app.server";

const authoritativeUrl = `https://${AUTHORITATIVE_APP_SUPABASE_PROJECT_REF}.supabase.co`;

describe("app Supabase authoritative runtime resolution", () => {
  it("prefers the hosted APP service-role configuration", () => {
    const resolved = resolveAppSupabaseConfig({
      NODE_ENV: "production",
      APP_SUPABASE_URL: authoritativeUrl,
      APP_SUPABASE_SERVICE_ROLE_KEY: "app-service-key",
      APP_SUPABASE_ANON_KEY: "app-anon-key",
      SUPABASE_URL: authoritativeUrl,
      SUPABASE_SERVICE_ROLE_KEY: "trusted-service-key",
    });

    expect(resolved).toEqual({
      url: authoritativeUrl,
      key: "app-service-key",
      source: "app-service-role",
    });
  });

  it("falls back to trusted server-only SUPABASE aliases for the same project", () => {
    const resolved = resolveAppSupabaseConfig({
      NODE_ENV: "production",
      SUPABASE_URL: authoritativeUrl,
      SUPABASE_SERVICE_ROLE_KEY: "trusted-service-key",
    });

    expect(resolved).toEqual({
      url: authoritativeUrl,
      key: "trusted-service-key",
      source: "trusted-service-role",
    });
  });

  it("rejects a remote non-authoritative project even when credentials exist", () => {
    const resolved = resolveAppSupabaseConfig({
      NODE_ENV: "production",
      APP_SUPABASE_URL: "https://wrongproject.supabase.co",
      APP_SUPABASE_SERVICE_ROLE_KEY: "wrong-service-key",
      SUPABASE_URL: "https://anotherwrong.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "another-key",
    });

    expect(resolved).toBeNull();
  });

  it("never treats browser VITE Supabase injection as a server database source", () => {
    const resolved = resolveAppSupabaseConfig({
      NODE_ENV: "production",
      VITE_SUPABASE_URL: authoritativeUrl,
      VITE_SUPABASE_ANON_KEY: "browser-key",
      VITE_SUPABASE_PUBLISHABLE_KEY: "browser-publishable-key",
    });

    expect(resolved).toBeNull();
  });

  it("allows an explicit localhost database only outside production", () => {
    expect(
      resolveAppSupabaseConfig({
        NODE_ENV: "development",
        APP_SUPABASE_URL: "http://127.0.0.1:54321",
        APP_SUPABASE_ANON_KEY: "local-anon",
      }),
    ).toMatchObject({ source: "app-anon" });

    expect(
      resolveAppSupabaseConfig({
        NODE_ENV: "production",
        APP_SUPABASE_URL: "http://127.0.0.1:54321",
        APP_SUPABASE_ANON_KEY: "local-anon",
      }),
    ).toBeNull();
  });
});
