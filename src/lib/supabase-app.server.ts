import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const AUTHORITATIVE_APP_SUPABASE_PROJECT_REF = "ldpwajisioljyjtojvfx";

type AppSupabaseConfig = {
  url: string;
  key: string;
  source:
    | "app-service-role"
    | "app-anon"
    | "trusted-service-role"
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
 * Trusted server/ops aliases are accepted only when they resolve to the same
 * authoritative Geomacro project. Explicit localhost Supabase is allowed only
 * outside production for disposable/local development.
 */
export function resolveAppSupabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppSupabaseConfig | null {
  const appUrl = normalized(env.APP_SUPABASE_URL);
  const trustedUrl = normalized(env.SUPABASE_URL);

  const candidates: Array<AppSupabaseConfig | null> = [
    appUrl && normalized(env.APP_SUPABASE_SERVICE_ROLE_KEY)
      ? {
          url: appUrl,
          key: normalized(env.APP_SUPABASE_SERVICE_ROLE_KEY) as string,
          source: "app-service-role",
        }
      : null,
    appUrl && normalized(env.APP_SUPABASE_ANON_KEY)
      ? {
          url: appUrl,
          key: normalized(env.APP_SUPABASE_ANON_KEY) as string,
          source: "app-anon",
        }
      : null,
    trustedUrl && normalized(env.SUPABASE_SERVICE_ROLE_KEY)
      ? {
          url: trustedUrl,
          key: normalized(env.SUPABASE_SERVICE_ROLE_KEY) as string,
          source: "trusted-service-role",
        }
      : null,
    trustedUrl && normalized(env.SUPABASE_ANON_KEY)
      ? {
          url: trustedUrl,
          key: normalized(env.SUPABASE_ANON_KEY) as string,
          source: "trusted-anon",
        }
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
