import { createHash } from "node:crypto";

import { requireRiskSupabase } from "./risk-supabase.server";

const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function requireFastTestnetTesterSession(rawToken: string) {
  const token = String(rawToken ?? "").trim();
  if (!/^gms_test_[A-Za-z0-9_-]{40,}$/.test(token)) {
    throw new Error("TESTER_SESSION_REQUIRED");
  }

  const db = requireRiskSupabase();
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const result = await db
    .from("testnet_tester_sessions")
    .select("id,principal_id,expires_at,revoked_at,last_seen_at")
    .eq("session_token_hash", sha256(token))
    .maybeSingle();

  if (result.error) throw result.error;
  const row = result.data;
  if (!row || row.revoked_at || new Date(String(row.expires_at)).getTime() <= nowMs) {
    throw new Error("TESTER_SESSION_NOT_AUTHORIZED");
  }

  // Authentication itself is never cached. Every request validates the current
  // session row from the authoritative database. Only non-security telemetry is
  // write-throttled so read-heavy Testnet API traffic does not perform one DB
  // UPDATE for every request.
  const lastSeenMs = row.last_seen_at ? new Date(String(row.last_seen_at)).getTime() : 0;
  if (!Number.isFinite(lastSeenMs) || nowMs - lastSeenMs >= SESSION_TOUCH_INTERVAL_MS) {
    void db
      .from("testnet_tester_sessions")
      .update({ last_seen_at: now })
      .eq("id", row.id)
      .is("revoked_at", null)
      .then(({ error }) => {
        if (error) {
          console.warn("[testnet-session] last_seen telemetry update failed", error.message);
        }
      });
  }

  return {
    principalId: String(row.principal_id),
    sessionId: String(row.id),
  } as const;
}

export const TESTNET_SESSION_PERFORMANCE_POLICY = {
  authoritative_db_validation_per_request: true,
  auth_decision_cache: false,
  last_seen_write_interval_ms: SESSION_TOUCH_INTERVAL_MS,
  telemetry_write_blocks_request: false,
} as const;
