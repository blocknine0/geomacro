import {
  requireRiskSupabase,
} from "./risk-supabase.server";

import {
  CENTRAL_SECURITY_VERSION,
} from "./central-security.server";


type CachedReadiness = {
  expiresAt: number;
  ready: boolean;
};


let cachedReadiness: CachedReadiness | null = null;
const READINESS_CACHE_MS = 30_000;


export async function assertRealFundsDatabaseSecurityReady(): Promise<void> {
  const now = Date.now();

  if (
    cachedReadiness &&
    cachedReadiness.expiresAt > now
  ) {
    if (!cachedReadiness.ready) {
      throw new Error("REAL_FUNDS_DATABASE_SECURITY_NOT_READY");
    }
    return;
  }

  const db = requireRiskSupabase();
  const { data, error } = await db.rpc(
    "central_security_database_readiness",
  );

  if (error) {
    cachedReadiness = {
      expiresAt: now + READINESS_CACHE_MS,
      ready: false,
    };
    throw new Error("REAL_FUNDS_DATABASE_SECURITY_PROBE_UNAVAILABLE");
  }

  const result =
    data &&
    typeof data === "object" &&
    !Array.isArray(data)
      ? data as Record<string, unknown>
      : null;

  const ready = Boolean(
    result &&
    result.ok === true &&
    result.ready === true &&
    result.security_version === CENTRAL_SECURITY_VERSION &&
    Number(result.missing_table_count) === 0 &&
    Number(result.browser_exposed_table_count) === 0 &&
    Number(result.rls_table_count) === Number(result.required_table_count),
  );

  cachedReadiness = {
    expiresAt: now + READINESS_CACHE_MS,
    ready,
  };

  if (!ready) {
    throw new Error("REAL_FUNDS_DATABASE_SECURITY_NOT_READY");
  }
}
