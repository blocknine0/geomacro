import { useState, useEffect } from "react";
import { supabaseFeed } from "./supabase-feed";
import { TABLES, JUROR_ROLE_ORDER, JUROR_ROLE_LABEL, JURY_THRESHOLD, type JurorRole } from "./dispute-config";

/**
 * useDisputeStatus.ts
 * ---------------------------------------------------------------
 * Reads the REAL schema already in the repo:
 *   supabase/migrations/001_ai_jury_dispute_system.sql
 *
 * Public dispute reads use the same-origin read-only data proxy exposed by
 * `supabaseFeed`. We intentionally poll instead of opening a Supabase Realtime
 * WebSocket from the browser. That keeps this public technical-proof surface
 * independent of hosting-injected Supabase keys while preserving the existing
 * 3-second refresh behaviour.
 *
 * jury_votes gets ONE row inserted per juror, right after that juror's
 * on-chain submitJuryVote() tx confirms (scripts/resolve-disputes.js,
 * sequential per juror — fact_checker, hawk_rearguer, dove_rearguer,
 * evidence_skeptic, domain_specialist, in that order). There is no
 * intermediate "gathering evidence" / "reasoning" state written anywhere —
 * a juror is either not-yet-voted or voted.
 * ---------------------------------------------------------------
 */

export type JuryVoteRow = {
  juror_role: JurorRole;
  juror_wallet: string;
  verdict: "OVERTURN" | "UPHOLD";
  reasoning: string | null;
  tx_hash: string;
  voted_at: string;
};

export type MarketDisputeRow = {
  market_id: string;
  disputer_address: string;
  bond_amount: string | null;
  overturn_votes: number;
  uphold_votes: number;
  resolved: boolean;
  final_verdict: "OVERTURNED" | "UPHELD" | "INCONCLUSIVE" | null;
  resolved_at: string | null;
  created_at: string;
};

export { JUROR_ROLE_LABEL, JUROR_ROLE_ORDER };

export function useDisputeStatus(marketId: string | null) {
  const [dispute, setDispute] = useState<MarketDisputeRow | null>(null);
  const [votes, setVotes] = useState<Record<string, JuryVoteRow>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!marketId) {
      setDispute(null);
      setVotes({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function loadAll() {
      const [disputeRes, votesRes] = await Promise.all([
        supabaseFeed.from(TABLES.marketDisputes).select("*").eq("market_id", marketId).maybeSingle(),
        supabaseFeed.from(TABLES.juryVotes).select("*").eq("market_id", marketId),
      ]);

      if (cancelled) return;

      if (disputeRes.error) console.warn(`[useDisputeStatus] ${TABLES.marketDisputes} fetch failed`, disputeRes.error);
      else setDispute(disputeRes.data as MarketDisputeRow | null);

      if (votesRes.error) {
        console.warn(`[useDisputeStatus] ${TABLES.juryVotes} fetch failed`, votesRes.error);
      } else {
        const byRole: Record<string, JuryVoteRow> = {};
        (votesRes.data as JuryVoteRow[] | null)?.forEach((v) => {
          byRole[v.juror_role] = v;
        });
        setVotes(byRole);
      }
      setLoading(false);
    }

    void loadAll();
    const pollId = setInterval(() => void loadAll(), 3000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [marketId]);

  const voteCount = Object.keys(votes).length;
  const resolved = dispute?.resolved ?? voteCount >= JURY_THRESHOLD;

  return { dispute, votes, voteCount, resolved, loading };
}
