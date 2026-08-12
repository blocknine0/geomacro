import { useState, useEffect } from "react";
import { supabaseFeed } from "./supabase-feed";
import { TABLES, JUROR_ROLE_ORDER, JUROR_ROLE_LABEL, JURY_THRESHOLD, realtimeChannelName, type JurorRole } from "./dispute-config";

/**
 * useDisputeStatus.ts
 * ---------------------------------------------------------------
 * Reads the REAL schema already in the repo:
 *   supabase/migrations/001_ai_jury_dispute_system.sql
 *
 * Reuses the already-exported `supabaseFeed` client (src/lib/supabase-feed.ts)
 * instead of creating a second client instance. Table/column names and jury
 * constants come from dispute-config.ts — nothing hardcoded here.
 *
 * jury_votes gets ONE row inserted per juror, right after that juror's
 * on-chain submitJuryVote() tx confirms (scripts/resolve-disputes.js,
 * sequential per juror — fact_checker, hawk_rearguer, dove_rearguer,
 * evidence_skeptic, domain_specialist, in that order). There is no
 * intermediate "gathering evidence" / "reasoning" state written anywhere —
 * a juror is either not-yet-voted or voted. The live feel comes from rows
 * arriving one at a time as the script works through the loop, not from
 * simulated sub-states.
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
  /** Stored as raw wei (18 decimals) by sync-lifecycle.js, as a numeric
   * column — Supabase returns big numeric values as strings to avoid
   * float precision loss, so parse with BigInt, not Number(). Use
   * weiToUsdc(BigInt(bond_amount)) from agent-arena.ts to display. */
  bond_amount: string | null;
  // ⚠️ overturn_votes / uphold_votes / resolved / final_verdict exist as
  // columns (see migration) but NOTHING currently writes to them after
  // the initial insert — resolve-disputes.js only ever reads dispute
  // state from the CONTRACT (getDispute()), never writes these back to
  // Supabase. They will sit at their insert defaults (0, 0, false, null)
  // forever as-is. Don't trust them for tally/resolved state — this hook
  // computes both from jury_votes rows instead, which IS reliably
  // written. See MARKET_DISPUTES_TALLY_COLUMNS_ARE_LIVE in
  // dispute-config.ts — flip that the day resolve-disputes.js writes
  // these back, and swap this hook to trust them directly instead of
  // recomputing from jury_votes.
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

    loadAll();

    // Realtime on jury_votes — requires the table added to the
    // supabase_realtime publication (Database > Replication in dashboard).
    // Falls back to the 3s poll below if not enabled.
    const channel = supabaseFeed
      .channel(realtimeChannelName(marketId))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: TABLES.juryVotes, filter: `market_id=eq.${marketId}` },
        (payload) => {
          const row = payload.new as JuryVoteRow;
          setVotes((prev) => ({ ...prev, [row.juror_role]: row }));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLES.marketDisputes, filter: `market_id=eq.${marketId}` },
        (payload) => {
          if (payload.new) setDispute(payload.new as MarketDisputeRow);
        }
      )
      .subscribe();

    const pollId = setInterval(loadAll, 3000);

    return () => {
      cancelled = true;
      supabaseFeed.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [marketId]);

  const voteCount = Object.keys(votes).length;
  const resolved = dispute?.resolved ?? voteCount >= JURY_THRESHOLD; // 4-of-5 supermajority settles it same-tx

  return { dispute, votes, voteCount, resolved, loading };
}
