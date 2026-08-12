import React, { useState, useCallback } from "react";
import { readMarketFullDetails, readMyStake, weiToUsdc } from "./agent-arena";
import { raiseDisputeOnContract } from "./agent-arena-v2";
import { computeDisputeBondWei, losingSide, canDispute } from "./dispute-bond";
import { useDisputeStatus, JUROR_ROLE_ORDER, JUROR_ROLE_LABEL, JuryVoteRow } from "./useDisputeStatus";
import { JURY_THRESHOLD } from "./dispute-config";
import { useWallet } from "@/hooks/WalletProvider";
import { ARC_TESTNET } from "./arc";

/**
 * DisputeTribunal.tsx (v2 — corrected against real AgentArenaV2.sol +
 * resolve-disputes.js + the existing Supabase schema)
 *
 * Corrections from the first draft, now that the real contract/scripts
 * have been reviewed:
 * - Bond is 8% of the caller's OWN losing-side stake, clamped $1-$40 —
 *   NOT a flat amount. Computed live via readMyStake() + computeDisputeBondWei().
 * - raiseDispute(marketId) takes no reason string — nothing is sent
 *   on-chain besides the bond. The modal no longer implies otherwise.
 * - Threshold is 4-of-5 (JURY_THRESHOLD), not a simple 3/5 majority.
 * - Juror identity is by ROLE (Fact-Checker, Hawk Re-arguer, Dove
 *   Re-arguer, Evidence Skeptic, Domain Specialist), not by AI provider
 *   brand name — that's an implementation detail the jury_votes table
 *   doesn't even expose.
 * - Vote values are OVERTURN / UPHOLD, not "reject".
 * ---------------------------------------------------------------
 */

const tokens = `
  :root {
    --dt-ink: #0A0B0D;
    --dt-panel: #121417;
    --dt-hairline: #2A2E33;
    --dt-paper: #E4E1D8;
    --dt-paper-dim: #8B887E;
    --dt-verdict: #3FA66B;
    --dt-dispute: #C4573B;
    --dt-pending: #D9A441;
  }
  .dt-root { font-family: 'Inter', system-ui, sans-serif; background: var(--dt-ink); color: var(--dt-paper); }
  .dt-mono { font-family: 'IBM Plex Mono', 'Courier New', monospace; }
  .dt-stamp { letter-spacing: 0.14em; text-transform: uppercase; font-size: 11px; }
`;

function JurorCard({ role, vote }: { role: string; vote: JuryVoteRow | undefined }) {
  const voted = !!vote;
  const color = !voted ? "var(--dt-paper-dim)" : vote.verdict === "OVERTURN" ? "var(--dt-verdict)" : "var(--dt-dispute)";

  return (
    <div
      style={{
        background: "var(--dt-panel)",
        border: `1px solid ${voted ? color : "var(--dt-hairline)"}`,
        borderRadius: 2,
        padding: "16px 18px",
        minHeight: 132,
        transition: "border-color 300ms ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="dt-mono" style={{ fontSize: 13 }}>{JUROR_ROLE_LABEL[role] ?? role}</span>
        <span className="dt-mono dt-stamp" style={{ color, fontWeight: 600 }}>
          {voted ? `VOTED: ${vote.verdict}` : "PENDING"}
        </span>
      </div>
      <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--dt-paper-dim)", lineHeight: 1.5, minHeight: 36 }}>
        {voted ? vote.reasoning : "Awaiting independent review — gathers its own evidence, sees no other juror's vote."}
      </div>
      {voted && (
        <a
          href={`${ARC_TESTNET.explorer}/tx/${vote.tx_hash}`}
          target="_blank"
          rel="noreferrer"
          className="dt-mono"
          style={{ display: "inline-block", marginTop: 10, fontSize: 10.5, color: "var(--dt-paper-dim)" }}
        >
          tx: {vote.tx_hash.slice(0, 10)}…{vote.tx_hash.slice(-6)} ↗
        </a>
      )}
    </div>
  );
}

function VerdictBanner({ voteCount, votes }: { voteCount: number; votes: Record<string, JuryVoteRow> }) {
  if (voteCount < JURY_THRESHOLD) return null;
  const overturns = Object.values(votes).filter((v) => v.verdict === "OVERTURN").length;
  const outcome = overturns >= JURY_THRESHOLD ? "overturned" : "upheld";
  const color = outcome === "overturned" ? "var(--dt-verdict)" : "var(--dt-dispute)";

  return (
    <div style={{ marginTop: 20, padding: "18px 20px", border: `1px solid ${color}`, borderRadius: 2 }}>
      <div className="dt-mono dt-stamp" style={{ color }}>
        Tribunal verdict — original AI resolution {outcome} ({Math.max(overturns, voteCount - overturns)}/5)
      </div>
      <p style={{ marginTop: 8, fontSize: 13.5, color: "var(--dt-paper-dim)", lineHeight: 1.6 }}>
        {outcome === "overturned"
          ? "Disputer's bond refunded plus a share of the dispute reserve pool. Market outcome flipped on-chain."
          : "Original resolution stands. Half the bond routed to treasury, half to the dispute reserve pool for future upheld disputes."}
      </p>
    </div>
  );
}

function RaiseDisputeModal({
  open,
  onClose,
  onConfirm,
  bondWei,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  bondWei: bigint | null;
  submitting: boolean;
}) {
  if (!open) return null;
  const bondUsdc = bondWei !== null ? weiToUsdc(bondWei) : null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,11,13,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "92vw", background: "var(--dt-panel)", border: "1px solid var(--dt-hairline)", borderRadius: 2, padding: 24 }}>
        <div className="dt-mono dt-stamp" style={{ color: "var(--dt-dispute)" }}>Raise dispute</div>

        {bondUsdc === null ? (
          <p style={{ marginTop: 10, fontSize: 13.5, color: "var(--dt-paper-dim)" }}>Checking your stake…</p>
        ) : (
          <p style={{ marginTop: 10, fontSize: 13.5, color: "var(--dt-paper-dim)", lineHeight: 1.6 }}>
            Required bond: <span className="dt-mono" style={{ color: "var(--dt-paper)" }}>{bondUsdc.toFixed(2)} USDC</span> — 8% of
            your losing-side stake on this market. Refunded (plus a reward share) if the tribunal overturns the verdict; half goes to
            treasury, half to the dispute reserve pool if upheld.
          </p>
        )}

        <p style={{ marginTop: 12, fontSize: 12, color: "var(--dt-paper-dim)", lineHeight: 1.6 }}>
          Five independent jurors — Fact-Checker, Hawk Re-arguer, Dove Re-arguer, Evidence Skeptic, Domain Specialist — will each
          gather their own fresh evidence and vote without seeing each other's reasoning. No written argument from you is required
          or reviewed; the jury judges the evidence directly.
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={onClose}
            disabled={submitting}
            className="dt-mono"
            style={{ flex: 1, padding: "10px 0", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", background: "transparent", border: "1px solid var(--dt-hairline)", color: "var(--dt-paper-dim)", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={bondWei === null || submitting}
            className="dt-mono"
            style={{ flex: 1, padding: "10px 0", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", background: bondWei !== null ? "var(--dt-dispute)" : "var(--dt-hairline)", border: "none", color: "#fff", cursor: bondWei !== null && !submitting ? "pointer" : "not-allowed" }}
          >
            {submitting ? "Confirming…" : "Post bond & raise"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DisputeTribunal({
  marketId,
  tentativeWinnerCode,
}: {
  marketId: string;
  /** 1 = HAWK, 2 = DOVE — the AI's tentative winner for this market. If
   * omitted, fetched via readMarketFullDetails() on mount. */
  tentativeWinnerCode?: 1 | 2;
}) {
  const { address, isSignedIn } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);
  const [bondWei, setBondWei] = useState<bigint | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disputeRaised, setDisputeRaised] = useState(false);

  // Always queried for this marketId — this is how we discover a dispute
  // already exists (e.g. someone else raised it, or a page reload after
  // raising one) without needing separate local state to gate the call.
  const { dispute, votes, voteCount } = useDisputeStatus(marketId);

  const openModal = useCallback(async () => {
    setError(null);
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    setModalOpen(true);
    setBondWei(null);
    try {
      let winnerCode = tentativeWinnerCode;
      if (!winnerCode) {
        const details = await readMarketFullDetails(marketId);
        if (!details) throw new Error("Could not read market details.");
        winnerCode = details.tentativeWinnerCode as 1 | 2;
      }
      const side = losingSide(winnerCode);
      const stake = await readMyStake(marketId, address);
      const losingStakeWei = side === 1 ? stake.hawkWei : stake.doveWei;
      if (!canDispute(losingStakeWei)) {
        setError("You have no stake on the losing side of this market — only losing-side stakers can dispute.");
        setModalOpen(false);
        return;
      }
      setBondWei(computeDisputeBondWei(losingStakeWei));
    } catch (e) {
      setError((e as Error).message ?? "Failed to compute dispute bond.");
      setModalOpen(false);
    }
  }, [address, marketId, tentativeWinnerCode]);

  const handleConfirm = useCallback(async () => {
    if (bondWei === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await raiseDisputeOnContract(marketId, bondWei);
      setModalOpen(false);
      setDisputeRaised(true);
    } catch (e) {
      setError((e as Error).message ?? "Transaction failed.");
    } finally {
      setSubmitting(false);
    }
  }, [marketId, bondWei]);

  return (
    <div className="dt-root" style={{ padding: 20, borderRadius: 4 }}>
      <style>{tokens}</style>

      {!disputeRaised && !dispute && (
        <>
          <button
            onClick={openModal}
            className="dt-mono dt-stamp"
            style={{ background: "transparent", border: "1px solid var(--dt-dispute)", color: "var(--dt-dispute)", padding: "10px 16px", cursor: "pointer" }}
          >
            Raise dispute
          </button>
          {error && <p style={{ marginTop: 8, fontSize: 12, color: "var(--dt-dispute)" }}>{error}</p>}
        </>
      )}

      {(disputeRaised || dispute) && (
        <>
          <div className="dt-mono dt-stamp" style={{ color: "var(--dt-paper-dim)", marginBottom: 14 }}>
            Case file · Market {marketId} · 5-juror tribunal ({voteCount}/5 voted)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {JUROR_ROLE_ORDER.map((role) => (
              <JurorCard key={role} role={role} vote={votes[role]} />
            ))}
          </div>
          <VerdictBanner voteCount={voteCount} votes={votes} />
        </>
      )}

      <RaiseDisputeModal open={modalOpen} onClose={() => setModalOpen(false)} onConfirm={handleConfirm} bondWei={bondWei} submitting={submitting} />
    </div>
  );
}
