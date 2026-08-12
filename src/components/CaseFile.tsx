import React from "react";
import { useDisputeStatus, JUROR_ROLE_ORDER, JUROR_ROLE_LABEL } from "./useDisputeStatus";
import { JURY_THRESHOLD } from "./dispute-config";
import { weiToUsdc } from "./agent-arena";
import { ARC_TESTNET } from "./arc";

/**
 * CaseFile.tsx (v2 — corrected)
 * Permanent public page for a resolved (or in-progress) dispute.
 * Route suggestion: /dispute/[marketId] — market_id is the natural key,
 * there's no separate dispute_id in the real schema.
 */

const tokens = `
  .cf-root { font-family: 'Inter', system-ui, sans-serif; background: #0A0B0D; color: #E4E1D8; min-height: 100vh; }
  .cf-mono { font-family: 'IBM Plex Mono', 'Courier New', monospace; }
`;

export default function CaseFile({ marketId, marketQuestion }: { marketId: string; marketQuestion?: string }) {
  const { dispute, votes, voteCount } = useDisputeStatus(marketId);
  const overturns = Object.values(votes).filter((v) => v.verdict === "OVERTURN").length;
  const settled = voteCount >= JURY_THRESHOLD;
  const outcome = settled ? (overturns >= JURY_THRESHOLD ? "overturned" : "upheld") : null;

  return (
    <div className="cf-root" style={{ padding: "48px 24px" }}>
      <style>{tokens}</style>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div className="cf-mono" style={{ fontSize: 11, color: "#8B887E", letterSpacing: "0.1em" }}>
          CASE FILE · MARKET {marketId}
        </div>
        <h1 style={{ marginTop: 10, fontSize: 26, fontWeight: 600, lineHeight: 1.35 }}>
          {marketQuestion ?? `Disputed market ${marketId}`}
        </h1>

        {dispute && (
          <p style={{ marginTop: 10, fontSize: 12.5, color: "#8B887E" }}>
            Disputed by <span className="cf-mono">{dispute.disputer_address.slice(0, 6)}…{dispute.disputer_address.slice(-4)}</span>
            {dispute.bond_amount != null && <> · bond {weiToUsdc(BigInt(dispute.bond_amount)).toFixed(2)} USDC</>}
          </p>
        )}

        <p style={{ marginTop: 14, fontSize: 13.5, color: "#8B887E", lineHeight: 1.6, maxWidth: 560 }}>
          Five independent jurors — each gathering its own evidence, reasoning without seeing the others' conclusions —
          reviewed this dispute. A 4-of-5 supermajority settles it. Every vote below is committed on-chain via
          <span className="cf-mono"> JuryVoted</span> events; reasoning text is mirrored here for transparency but the
          on-chain vote is always the source of truth.
        </p>

        {settled && (
          <div style={{ marginTop: 24, padding: "16px 18px", border: `1px solid ${outcome === "overturned" ? "#3FA66B" : "#C4573B"}`, borderRadius: 2 }}>
            <span className="cf-mono" style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: outcome === "overturned" ? "#3FA66B" : "#C4573B" }}>
              Final verdict — {outcome} ({Math.max(overturns, voteCount - overturns)}/5)
            </span>
          </div>
        )}

        <div style={{ marginTop: 32 }}>
          {JUROR_ROLE_ORDER.map((role) => {
            const vote = votes[role];
            return (
              <div key={role} style={{ borderTop: "1px solid #2A2E33", padding: "20px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span className="cf-mono" style={{ fontSize: 14 }}>{JUROR_ROLE_LABEL[role]}</span>
                  <span className="cf-mono" style={{ fontSize: 11, color: vote ? (vote.verdict === "OVERTURN" ? "#3FA66B" : "#C4573B") : "#8B887E" }}>
                    {vote ? vote.verdict : "PENDING"}
                  </span>
                </div>
                {vote?.reasoning && (
                  <p style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.6, color: "#C9C6BC", maxWidth: 640 }}>{vote.reasoning}</p>
                )}
                {vote?.tx_hash && (
                  <a
                    href={`${ARC_TESTNET.explorer}/tx/${vote.tx_hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="cf-mono"
                    style={{ display: "inline-block", marginTop: 10, fontSize: 10.5, color: "#8B887E" }}
                  >
                    tx: {vote.tx_hash.slice(0, 10)}…{vote.tx_hash.slice(-6)} ↗
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
