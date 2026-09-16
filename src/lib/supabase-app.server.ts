import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const AUTHORITATIVE_APP_SUPABASE_PROJECT_REF = "ldpwajisioljyjtojvfx";

type AppSupabaseConfig = {
  url: string;
  key: string;
  source:
    | "app-service-role"
    | "app-trusted-service-role"
    | "app-anon"
    | "trusted-service-role"
    | "trusted-app-service-role"
    | "trusted-anon";
};

function normalized(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function projectRefOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    const suffix = ".supabase.co";
    if (!parsed.hostname.endsWith(suffix)) return null;
    return parsed.hostname.slice(0, -suffix.length) || null;
  } catch {
    return null;
  }
}

function isExplicitLocalDevelopmentUrl(url: string, env: NodeJS.ProcessEnv): boolean {
  if (env.NODE_ENV === "production") return false;
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

/**
 * Resolve the app-owned Supabase runtime without ever trusting hosting/browser
 * VITE_SUPABASE_* injection. APP_* remains the preferred hosted SSR naming.
 * Trusted server/ops aliases are accepted only when the selected URL resolves
 * to the same authoritative Geomacro project. This also tolerates mixed legacy
 * server naming such as APP_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Explicit localhost Supabase is allowed only outside production.
 */
export function resolveAppSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppSupabaseConfig | null {
  const appUrl = normalized(env.APP_SUPABASE_URL);
  const trustedUrl = normalized(env.SUPABASE_URL);
  const appService = normalized(env.APP_SUPABASE_SERVICE_ROLE_KEY);
  const trustedService = normalized(env.SUPABASE_SERVICE_ROLE_KEY);
  const appAnon = normalized(env.APP_SUPABASE_ANON_KEY);
  const trustedAnon = normalized(env.SUPABASE_ANON_KEY);

  const candidates: Array<AppSupabaseConfig | null> = [
    appUrl && appService
      ? { url: appUrl, key: appService, source: "app-service-role" }
      : null,
    appUrl && trustedService
      ? { url: appUrl, key: trustedService, source: "app-trusted-service-role" }
      : null,
    appUrl && appAnon
      ? { url: appUrl, key: appAnon, source: "app-anon" }
      : null,
    trustedUrl && trustedService
      ? { url: trustedUrl, key: trustedService, source: "trusted-service-role" }
      : null,
    trustedUrl && appService
      ? { url: trustedUrl, key: appService, source: "trusted-app-service-role" }
      : null,
    trustedUrl && trustedAnon
      ? { url: trustedUrl, key: trustedAnon, source: "trusted-anon" }
      : null,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const projectRef = projectRefOf(candidate.url);
    if (
      projectRef === AUTHORITATIVE_APP_SUPABASE_PROJECT_REF ||
      isExplicitLocalDevelopmentUrl(candidate.url, env)
    ) {
      return candidate;
    }
  }

  return null;
}

/**
 * App-owned Supabase client (separate from any Lovable Cloud project).
 *
 * IMPORTANT:
 * - never consumes browser VITE_SUPABASE_* values;
 * - prefers APP_* hosted-runtime configuration;
 * - can recover from APP_* binding gaps by using trusted server-only SUPABASE_*
 *   aliases for the same authoritative Geomacro project;
 * - does not cache a failed/null resolution because some edge runtimes bind
 *   environment variables at request time.
 */
let cachedClient: SupabaseClient | null = null;
let cachedIdentity: string | null = null;

export function getAppSupabase(): SupabaseClient | null {
  const config = resolveAppSupabaseConfig();
  if (!config) return null;

  const identity = `${config.url}|${config.source}`;
  if (cachedClient && cachedIdentity === identity) return cachedClient;

  cachedClient = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cachedIdentity = identity;
  return cachedClient;
}
