import { requireRiskSupabase } from "./risk-supabase.server";

export async function loadTestnetTesterCreditBalance(principalId: string) {
  const db = requireRiskSupabase();
  const result = await db
    .from("commercial_credit_accounts")
    .select("included_credits,credits_used,status,period_ends_at")
    .eq("principal_type", "api_client")
    .eq("principal_id", principalId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    return {
      included_credits: 0,
      credits_used: 0,
      credits_remaining: 0,
      credit_status: "inactive",
      period_ends_at: null,
    } as const;
  }

  const included = Number(result.data.included_credits ?? 0);
  const used = Number(result.data.credits_used ?? 0);
  return {
    included_credits: included,
    credits_used: used,
    credits_remaining: Math.max(0, included - used),
    credit_status: String(result.data.status ?? "inactive"),
    period_ends_at: result.data.period_ends_at ? String(result.data.period_ends_at) : null,
  } as const;
}
