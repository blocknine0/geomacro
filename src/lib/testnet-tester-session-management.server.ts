import { requireRiskSupabase } from "./risk-supabase.server";

export async function revokeTestnetTesterSession(input: {
  principalId: string;
  sessionId: string;
}) {
  const db = requireRiskSupabase();
  const now = new Date().toISOString();
  const result = await db
    .from("testnet_tester_sessions")
    .update({ revoked_at: now })
    .eq("id", input.sessionId)
    .eq("principal_id", input.principalId)
    .is("revoked_at", null);
  if (result.error) throw result.error;
  return { revoked: true } as const;
}
