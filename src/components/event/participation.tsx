/**
 * Participation surface for a single event.
 *
 * Contract interaction is unchanged: the same stakeOnContract → recordStake →
 * rememberSessionTx sequence the Arena uses. This file only supplies a clearer
 * choose → amount → review → confirm flow and Phase 1 user-facing errors.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { EventSection, Panel } from "@/components/event/section";
import { EmptyState, InlineError } from "@/components/foundation/async-states";
import { EmptyValue } from "@/components/foundation/data";
import {
  ExplorerLink,
  TechnicalDisclosure,
  TestnetNotice,
  TransactionProgress,
  WalletActionBoundary,
  WrongNetworkNotice,
  type TxState,
} from "@/components/foundation/onchain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/hooks/WalletProvider";
import { preferredNetwork } from "@/lib/arc";
import type { AgentSide } from "@/lib/agents";
import {
  AGENT_ARENA_ADDRESS,
  readMyStake,
  stakeOnContract,
  usdcToWei,
  type OnchainStake,
} from "@/lib/agent-arena";
import { recordStake } from "@/lib/positions.functions";
import { rememberSessionTx } from "@/lib/wallet-tx";
import { notify } from "@/lib/notify";
import type { EventDetail } from "@/lib/use-event-detail";
import { cn } from "@/lib/utils";

type Step = "choose" | "amount" | "review" | "pending";

const SIDES: Array<{ side: AgentSide; label: string; sub: string }> = [
  { side: "HAWK", label: "Escalation", sub: "The situation intensifies" },
  { side: "DOVE", label: "Stabilization", sub: "The situation calms" },
];

export function ParticipationSection({ detail }: { detail: EventDetail }) {
  const { address, onArc, connect, connecting, switchToArc, session, sessionReady, signIn, signingIn } =
    useWallet();
  const callRecordStake = useServerFn(recordStake);
  const activeNet = preferredNetwork();
  const market = detail.market;

  const [side, setSide] = useState<AgentSide | null>(null);
  const [amount, setAmount] = useState("10");
  const [step, setStep] = useState<Step>("choose");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txState, setTxState] = useState<TxState | null>(null);
  const [myStake, setMyStake] = useState<OnchainStake | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!market || !address) return;
    void (async () => {
      try {
        const s = await readMyStake(market.id, address, undefined, market.marketAddress);
        if (!cancelled) setMyStake(s);
      } catch {
        /* read-only enrichment; the page stays usable without it */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [market, address, txHash]);

  if (!market) {
    return (
      <EventSection id="participate" title="Take a position">
        <EmptyState
          title="No market is open for this event"
          description="Participation becomes available only when a market has been opened for an event."
        />
      </EventSection>
    );
  }

  const stakingOpen = Date.now() < market.stakingEndTime && !market.marketFinalized;
  const closeLabel = new Date(market.stakingEndTime).toLocaleString();
  const settleLabel = new Date(market.resolutionAt).toLocaleString();

  async function submit() {
    if (!market || !side || !address) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a positive USDC amount.");
      return;
    }
    if (!onArc) {
      void switchToArc();
      return;
    }
    let activeSession = session;
    if (!activeSession && sessionReady && !signingIn) activeSession = await signIn();
    if (!activeSession) {
      setError("Sign-in required to record your position.");
      return;
    }
    setStep("pending");
    setError(null);
    setTxState("confirm");
    try {
      const { hash, confirmed } = await stakeOnContract(market.id, side, amount, market.marketAddress);
      setTxHash(hash);
      setTxState("pending");
      if (market.eventId) {
        try {
          await callRecordStake({
            data: {
              token: activeSession.token,
              marketId: market.eventId,
              side,
              stakedAmountRaw: usdcToWei(amount).toString(),
              txHash: hash,
            },
          });
        } catch (err) {
          console.error("[recordStake] failed", err);
        }
      }
      void confirmed.then(({ success, error: confirmError }) => {
        if (!success) console.warn("[stake] confirmation did not complete", { marketId: market.id, error: confirmError });
      });
      rememberSessionTx(activeNet, address, {
        hash,
        from: address,
        to: AGENT_ARENA_ADDRESS,
        valueWei: String(BigInt(Math.round(value * 1e6)) * BigInt(1e12)),
        timestamp: Math.floor(Date.now() / 1000),
        blockNumber: null,
        input: `stake(${market.id},${side})`,
      });
      notify.success("Position submitted", "It is recorded and will confirm onchain shortly.");
      setTxState("complete");
      setStep("choose");
      setSide(null);
    } catch (e) {
      setError(notify.error("event.stake", e, "submitting your position").message);
      setTxState("failed");
      setStep("review");
    }
  }

  return (
    <EventSection
      id="participate"
      title="Take a position"
      subtitle="If you want to express a view on this event, you can participate through the available market."
    >
      <Panel>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="type-meta text-muted-foreground">Current probability</dt>
            <dd className="type-metric mt-1 text-2xl text-foreground">
              {detail.marketProbability === null ? (
                <EmptyValue label="No positions yet" />
              ) : (
                `${detail.marketProbability}%`
              )}
            </dd>
          </div>
          <div>
            <dt className="type-meta text-muted-foreground">Participation closes</dt>
            <dd className="mt-1 type-body text-foreground">{closeLabel}</dd>
          </div>
          <div>
            <dt className="type-meta text-muted-foreground">Settlement</dt>
            <dd className="mt-1 type-body text-foreground">{settleLabel}</dd>
          </div>
        </dl>

        {myStake && (myStake.hawkUsdc > 0 || myStake.doveUsdc > 0) && (
          <p className="mt-4 rounded-[var(--radius-control)] border border-border/60 bg-background/40 px-3 py-2 type-body text-muted-foreground">
            Your recorded position: {myStake.hawkUsdc} USDC on escalation, {myStake.doveUsdc} USDC on
            stabilization.
          </p>
        )}

        {!stakingOpen ? (
          <div className="mt-5 border-t border-border/60 pt-5">
            <EmptyState
              title="Participation is closed for this event"
              description="Positions can no longer be opened. Settlement details stay visible below."
            />
          </div>
        ) : (
          <div className="mt-5 border-t border-border/60 pt-5">
            {!address ? (
              <WalletActionBoundary connected={false} connecting={connecting} onConnect={connect} />
            ) : (
              <div className="space-y-4">
                {!onArc && (
                  <WrongNetworkNotice
                    targetName={activeNet.chainName}
                    onSwitch={() => void switchToArc()}
                  />
                )}
                <fieldset>
                  <legend className="type-meta text-muted-foreground">1. Choose a side</legend>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {SIDES.map((s) => (
                      <button
                        key={s.side}
                        type="button"
                        aria-pressed={side === s.side}
                        onClick={() => {
                          setSide(s.side);
                          setStep("amount");
                          setError(null);
                        }}
                        className={cn(
                          "tap-target rounded-[var(--radius-card)] border px-4 py-3 text-left transition-colors",
                          side === s.side
                            ? "border-primary bg-primary/10"
                            : "border-border/70 hover:border-primary/50",
                        )}
                      >
                        <span className="block text-sm font-medium text-foreground">{s.label}</span>
                        <span className="block type-body text-muted-foreground">{s.sub}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                {side && (
                  <div>
                    <label htmlFor="stake-amount" className="type-meta text-muted-foreground">
                      2. Enter amount (USDC)
                    </label>
                    <Input
                      id="stake-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setStep("amount");
                      }}
                      className="mt-2 h-11 max-w-xs"
                    />
                  </div>
                )}

                {side && step !== "choose" && (
                  <div className="rounded-[var(--radius-card)] border border-border/60 bg-background/40 p-4">
                    <p className="type-meta text-muted-foreground">3. Review</p>
                    <dl className="mt-2 space-y-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <dt className="type-body text-muted-foreground">Outcome</dt>
                        <dd className="type-body text-foreground">
                          {side === "HAWK" ? "Escalation" : "Stabilization"}
                        </dd>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <dt className="type-body text-muted-foreground">Amount</dt>
                        <dd className="type-metric text-foreground">
                          {Number(amount) > 0 ? `${amount} USDC` : <EmptyValue label="Enter an amount" />}
                        </dd>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <dt className="type-body text-muted-foreground">Current probability</dt>
                        <dd className="type-metric text-foreground">
                          {detail.marketProbability === null ? (
                            <EmptyValue label="No market price" />
                          ) : (
                            `${detail.marketProbability}%`
                          )}
                        </dd>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <dt className="type-body text-muted-foreground">Settlement</dt>
                        <dd className="type-body text-foreground">{settleLabel}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 type-timestamp text-muted-foreground">
                      Payouts are determined by the contract at settlement. No projected return is
                      shown because the final pool is not known in advance.
                    </p>
                  </div>
                )}

                {txState && (
                  <TransactionProgress
                    state={txState}
                    message={txState === "failed" && error ? error : undefined}
                  />
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    className="tap-target gap-2"
                    disabled={!side || step === "pending"}
                    onClick={() => void submit()}
                  >
                    {step === "pending" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    {step === "pending"
                      ? "Confirming…"
                      : txState === "failed"
                        ? "Try again"
                        : "4. Confirm position"}
                  </Button>
                  <ExplorerLink network={activeNet} hash={txHash} label="View last transaction" />
                </div>

                {error && !txState && <InlineError error={error} />}

                <TestnetNotice network={activeNet} />

                <TechnicalDisclosure
                  rows={[
                    { label: "Network", value: activeNet.chainName },
                    { label: "Chain ID", value: String(activeNet.chainIdDec) },
                    {
                      label: "Contract",
                      value: market.marketAddress,
                      href: `${activeNet.explorer}/address/${market.marketAddress}`,
                    },
                    { label: "Market ID", value: market.id },
                    {
                      label: "Transaction",
                      value: txHash,
                      href: txHash ? `${activeNet.explorer}/tx/${txHash}` : undefined,
                    },
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </Panel>
    </EventSection>
  );
}
