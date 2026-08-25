import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Gavel, Loader2, LogIn, RefreshCw, Trophy, Wallet, X } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/WalletProvider";
import { preferredNetwork } from "@/lib/arc";
import {
  claimOnContract,
  weiToUsdc,
  OLD_CONTRACT_ADDRESS,
} from "@/lib/agent-arena";
import {
  getMyBalanceHistory,
  getMyPositions,
  recordClaim,
  type BalanceHistoryRow,
  type PortfolioPosition,
} from "@/lib/positions.functions";
import { shortAddr } from "@/components/section-ui";
import { EmptyState } from "@/components/foundation/async-states";
import { Wordmark } from "@/components/wordmark";
import { rememberSessionTx } from "@/lib/wallet-tx";
import { notify } from "@/lib/notify";
import {
  ExplorerLink,
  TechnicalDisclosure,
  TestnetNotice,
  TransactionProgress,
  type TxState,
} from "@/components/foundation/onchain";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio · Geomacro" },
      {
        name: "description",
        content:
          "Your Agent Arena activity: wallet balance, active positions, pending claims and full history.",
      },
      { property: "og:title", content: "Portfolio · Geomacro" },
      {
        property: "og:description",
        content:
          "Your Agent Arena activity: wallet balance, active positions, pending claims and full history.",
      },
      { property: "og:url", content: "https://geomacro.live/portfolio" },
      // Wallet-gated, per-user view with no crawlable content: intentionally excluded from search.
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/portfolio" }],
  }),
  component: PortfolioPage,
});

function fmtUsdc(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

type RangeKey = "1D" | "1W" | "1M" | "1Y" | "YTD" | "ALL";
const RANGE_OPTIONS: RangeKey[] = ["1D", "1W", "1M", "1Y", "YTD", "ALL"];

function rangeStartMs(range: RangeKey): number | null {
  const now = new Date();
  switch (range) {
    case "1D":
      return now.getTime() - 24 * 60 * 60 * 1000;
    case "1W":
      return now.getTime() - 7 * 24 * 60 * 60 * 1000;
    case "1M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d.getTime();
    }
    case "1Y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d.getTime();
    }
    case "YTD":
      return new Date(now.getFullYear(), 0, 1).getTime();
    case "ALL":
    default:
      return null;
  }
}

function rangeLabel(r: RangeKey): string {
  switch (r) {
    case "1D": return "Past day";
    case "1W": return "Past week";
    case "1M": return "Past month";
    case "1Y": return "Past year";
    case "YTD": return "Year to date";
    case "ALL":
    default: return "All time";
  }
}

function stakedUsdc(p: PortfolioPosition): number {
  try {
    return weiToUsdc(BigInt(p.staked_amount_raw));
  } catch {
    return 0;
  }
}

function marketTitle(p: PortfolioPosition): string {
  return p.event?.source_title || p.event?.narrative || "Untitled market";
}

function PortfolioPage() {
  const {
    address,
    network,
    connect,
    connecting,
    session,
    signIn,
    signingIn,
    balance: balanceUsdc,
    balanceLoading,
    refreshBalance,
  } = useWallet();
  const activeNet = network ?? preferredNetwork();
  const callGetPositions = useServerFn(getMyPositions);
  const callGetHistory = useServerFn(getMyBalanceHistory);
  const callRecordClaim = useServerFn(recordClaim);

  const [positions, setPositions] = useState<PortfolioPosition[] | null>(null);
  const [history, setHistory] = useState<BalanceHistoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimTx, setClaimTx] = useState<Record<string, string>>({});
  const [claimStage, setClaimStage] = useState<Record<string, TxState>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("1D");

  const refresh = useCallback(
    async (showSpinner = true) => {
      if (!session) return;
      if (showSpinner) setRefreshing(true);
      setError(null);
      try {
        const [pos, hist] = await Promise.all([
          callGetPositions({ data: { token: session.token } }),
          callGetHistory({ data: { token: session.token } }),
        ]);
        setPositions(pos.positions);
        setHistory(hist);
      } catch (e) {
        setError((e as Error).message ?? "Failed to load portfolio");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [callGetPositions, callGetHistory, session],
  );

  useEffect(() => {
    if (!session) {
      setPositions(null);
      setHistory(null);
      return;
    }
    setLoading(true);
    void refresh(false);
  }, [session, refresh]);

  const active = useMemo(
    () => (positions ?? []).filter((p) => p.status === "active"),
    [positions],
  );
  const pending = useMemo(
    () => (positions ?? []).filter((p) => p.status === "pending_claim"),
    [positions],
  );
  const claimed = useMemo(
    () => (positions ?? []).filter((p) => p.status === "claimed"),
    [positions],
  );
  const lost = useMemo(
    () => (positions ?? []).filter((p) => p.status === "lost"),
    [positions],
  );

  const totalStaked = useMemo(
    () => active.reduce((s, p) => s + stakedUsdc(p), 0),
    [active],
  );
  const totalPendingWinnings = useMemo(
    () => pending.reduce((s, p) => s + (p.payout_amount ?? 0), 0),
    [pending],
  );

  const chartData = useMemo(() => {
    if (!history || history.length === 0) return [] as Array<{ ts: number; date: string; balance: number; delta: number; type: string }>;
    let running = 0;
    return history.map((h) => {
      running += Number(h.amount_delta ?? 0);
      return {
        ts: new Date(h.created_at).getTime(),
        date: new Date(h.created_at).toLocaleDateString(),
        balance: running,
        delta: Number(h.amount_delta ?? 0),
        type: h.event_type,
      };
    });
  }, [history]);

  const pnlSummary = useMemo(() => {
    if (chartData.length === 0) return null;
    const first = chartData[0].balance;
    const last = chartData[chartData.length - 1].balance;
    const pnl = last - first;
    const pct = first !== 0 ? (pnl / Math.abs(first)) * 100 : 0;
    return { pnl, pct, isPositive: pnl >= 0 };
  }, [chartData]);

  const rangedChartData = useMemo(() => {
    const start = rangeStartMs(range);
    const filtered = start === null ? chartData : chartData.filter((d) => d.ts >= start);
    return filtered.length > 0 ? filtered : chartData.slice(-1);
  }, [chartData, range]);

  const currentBalance = chartData.length > 0 ? chartData[chartData.length - 1].balance : 0;

  const periodChange = useMemo(() => {
    if (rangedChartData.length === 0) return { abs: 0, pct: null };
    const first = rangedChartData[0].balance;
    const last = rangedChartData[rangedChartData.length - 1].balance;
    const abs = last - first;
    const meaningfulStart = Math.abs(first) > 0.01;
    const pct = meaningfulStart ? (abs / Math.abs(first)) * 100 : null;
    return { abs, pct };
  }, [rangedChartData]);
  // keep pnlSummary referenced to avoid unused-var churn
  void pnlSummary;

  async function handleClaim(p: PortfolioPosition) {
    if (!session) return;
    setClaimError(null);
    setClaiming(p.market_id);
    setClaimStage((prev) => ({ ...prev, [p.market_id]: "confirm" }));
    try {
      const onchainMarketId = `mkt_${p.market_id}`;
      // 🛡️ FIX: was always calling claimOnContract with no address override,
      // so it defaulted to AGENT_ARENA_ADDRESS (V2) for every market — any
      // claim on a market that actually lives on legacy V1 would revert
      // ("Market does not exist"), surfacing as "We couldn't complete the
      // transaction" with no further explanation. Now routes to whichever
      // contract this specific market was actually created on.
      const claimTargetAddress = p.event?.market_address || OLD_CONTRACT_ADDRESS;
      const hash = await claimOnContract(onchainMarketId, claimTargetAddress);
      setClaimTx((prev) => ({ ...prev, [p.market_id]: hash }));
      setClaimStage((prev) => ({ ...prev, [p.market_id]: "pending" }));
      try {
        await callRecordClaim({
          data: { token: session.token, marketId: p.market_id, txHash: hash },
        });
      } catch (err) {
        console.error("[recordClaim] failed", err);
      }
      rememberSessionTx(activeNet, address ?? "", {
        hash,
        from: address ?? "",
        to: claimTargetAddress,
        valueWei: "0",
        timestamp: Math.floor(Date.now() / 1000),
        blockNumber: null,
        input: `claim(${onchainMarketId})`,
      });
      setTimeout(() => {
        void refresh(true);
        void refreshBalance();
      }, 1500);
      setClaimStage((prev) => ({ ...prev, [p.market_id]: "complete" }));
      setReviewing(null);
      notify.success("Claim submitted", "Your payout will appear once the network confirms it.");
    } catch (e) {
      setClaimError(notify.error("portfolio.claim", e, "claiming your payout").message);
      setClaimStage((prev) => ({ ...prev, [p.market_id]: "failed" }));
    } finally {
      setClaiming(null);
    }
  }

  // --- AUTH GATE ---

  if (!address) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Connect your wallet</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your portfolio is fully on-chain. Connect a wallet to view your positions, pending claims and balance history.
        </p>
        <Button className="mt-6 gap-2" onClick={() => void connect()} disabled={connecting}>
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          {connecting ? "Connecting…" : "Connect Wallet"}
        </Button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <LogIn className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Sign in with your wallet</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sign a gasless message from <span className="font-mono text-foreground">{shortAddr(address)}</span> to prove ownership. Nothing is spent, no transaction is sent.
        </p>
        <Button className="mt-6 gap-2" onClick={() => void signIn()} disabled={signingIn}>
          {signingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {signingIn ? "Waiting for signature…" : "Sign in with wallet"}
        </Button>
      </div>
    );
  }

  // --- MAIN CONTENT ---

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-primary">Portfolio</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">PORTFOLIO</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Track your active positions, settlement status and available actions.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as <span className="font-mono text-foreground">{shortAddr(address)}</span> on {activeNet.chainName}.
          </p>
          <TestnetNotice network={activeNet} className="mt-3 max-w-md" />
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh(true)} disabled={refreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </header>

      {error && (
        <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Row 1: Wallet balance + Balance history */}
      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card/40 p-5 backdrop-blur">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Wallet Balance
          </div>
          {balanceUsdc === null ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              {balanceLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading…
                </>
              ) : (
                <>
                  <span>Unavailable</span>
                  <button
                    type="button"
                    onClick={() => void refreshBalance(true)}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    retry
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 font-mono text-3xl tabular-nums">
              {fmtUsdc(Number(balanceUsdc))}{" "}
              <span className="text-sm text-muted-foreground">USDC</span>
              {balanceLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Live on-chain balance on {activeNet.chainName}.
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/40 p-5 backdrop-blur lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Balance History
              </div>
              {history === null ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : chartData.length === 0 ? null : (
                <>
                  <div className="mt-0 font-mono text-3xl font-semibold tabular-nums text-foreground">
                    ${fmtUsdc(currentBalance, 2)}
                  </div>
                  <div
                    className={`mt-0 flex flex-wrap items-center gap-x-1.5 text-xs font-medium ${
                      periodChange.abs >= 0 ? "text-emerald-400" : "text-destructive"
                    }`}
                  >
                    <span>
                      {periodChange.abs >= 0 ? "+" : ""}
                      {fmtUsdc(periodChange.abs, 2)} USDC
                    </span>
                    {periodChange.pct !== null && (
                      <span className="opacity-70">
                        ({periodChange.abs >= 0 ? "+" : ""}
                        {periodChange.pct.toFixed(2)}%)
                      </span>
                    )}
                    <span className="text-muted-foreground opacity-60">· {rangeLabel(range)}</span>
                  </div>
                </>
              )}
            </div>
            <div className="self-start opacity-70">
              <span className="font-mono text-sm font-semibold uppercase tracking-widest text-foreground">
                Geomacro
              </span>
            </div>
          </div>

          {history !== null && chartData.length > 0 && (
            <div className="mt-2 flex w-fit items-center gap-1 rounded-full border border-border/60 bg-background/40 p-1">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`min-h-11 rounded-full px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide transition-colors sm:min-h-0 ${
                    range === r
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          {history === null ? null : chartData.length === 0 ? (
            <EmptyHint>No activity yet.</EmptyHint>
          ) : (
            <div className="mt-2 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={rangedChartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bal-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                      <stop offset="60%" stopColor="var(--primary)" stopOpacity={0.08} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                  <Tooltip
                    cursor={{ stroke: "var(--primary)", strokeOpacity: 0.25, strokeWidth: 1 }}
                    content={({ active: a, payload }) => {
                      if (!a || !payload?.length) return null;
                      const d = payload[0].payload as (typeof chartData)[number];
                      const positive = d.delta >= 0;
                      return (
                        <div className="rounded-lg border border-border/60 bg-card/95 p-3 text-xs shadow-lg backdrop-blur">
                          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            {d.date} · {d.type}
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-4">
                            <span className={positive ? "text-primary" : "text-destructive"}>
                              {positive ? "+" : ""}
                              {fmtUsdc(d.delta)} USDC
                            </span>
                            <span className="font-mono tabular-nums text-muted-foreground">
                              bal {fmtUsdc(d.balance)}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    fill="url(#bal-fill)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
                    isAnimationActive={true}
                    animationDuration={500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Row 2: 4 stat cards */}
      <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Staked"
          value={active.length === 0 ? null : `${fmtUsdc(totalStaked)} USDC`}
        />
        <StatCard
          label="Est. Pending Winnings"
          value={pending.length === 0 ? null : `${fmtUsdc(totalPendingWinnings)} USDC`}
          accent={totalPendingWinnings > 0}
        />
        <StatCard
          label="Active Stakes"
          value={active.length === 0 ? null : String(active.length)}
        />
        <StatCard
          label="Pending Claims"
          value={pending.length === 0 ? null : String(pending.length)}
          accent={pending.length > 0}
        />
      </section>

      {loading && positions === null ? (
        <div className="mt-16 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading positions…
        </div>
      ) : (positions ?? []).length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Your portfolio is empty"
            description="Participate in an available market to see your position here."
            action={
              <Button asChild size="sm">
                <Link to="/arena">Explore markets</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <Section
            title="Active Positions"
            subtitle="Open markets where you currently have a stake."
          >
            {active.length === 0 ? (
              <EmptyHint>No active positions.</EmptyHint>
            ) : (
              <div className="space-y-3">
                {active.map((p) => (
                  <PositionRow
                    key={`${p.market_id}-${p.side}`}
                    p={p}
                    amountLabel={`${fmtUsdc(stakedUsdc(p))} USDC staked`}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Pending Claims"
            subtitle="Resolved markets where you have unclaimed winnings."
          >
            {pending.length === 0 ? (
              <EmptyHint>No pending claims.</EmptyHint>
            ) : (
              <div className="space-y-3">
                {pending.map((p) => (
                  <PositionRow
                    key={`${p.market_id}-${p.side}`}
                    p={p}
                    highlight
                    amountLabel={
                      p.payout_amount != null
                        ? `Payout ${fmtUsdc(p.payout_amount)} USDC`
                        : "Payout pending"
                    }
                    resolvedOutcome={p.resolved_outcome}
                    actionSlot={
                      <div className="flex w-full min-w-0 flex-col gap-2 md:w-72 md:items-end">
                        {reviewing === p.market_id ? (
                          <div className="w-full rounded-xl border border-border/60 bg-background/40 p-3 text-left">
                            <p className="text-sm font-medium text-foreground">Review your claim</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              You are asking the contract to release your settled payout
                              {p.payout_amount != null
                                ? ` of ${fmtUsdc(p.payout_amount)} USDC`
                                : ""}{" "}
                              to your wallet. You will confirm the transaction in your wallet next.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                className="tap-target gap-2"
                                onClick={() => void handleClaim(p)}
                                disabled={claiming === p.market_id}
                              >
                                {claiming === p.market_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Gavel className="h-4 w-4" />
                                )}
                                {claiming === p.market_id ? "Confirming…" : "Confirm claim"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="tap-target"
                                onClick={() => setReviewing(null)}
                                disabled={claiming === p.market_id}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="tap-target gap-2"
                            onClick={() => setReviewing(p.market_id)}
                            disabled={claiming === p.market_id}
                          >
                            <Gavel className="h-4 w-4" />
                            {claimStage[p.market_id] === "failed" ? "Try again" : "Claim"}
                          </Button>
                        )}
                        {claimStage[p.market_id] && (
                          <TransactionProgress
                            state={claimStage[p.market_id]}
                            className="w-full text-left"
                            message={
                              claimStage[p.market_id] === "failed" && claimError
                                ? claimError
                                : undefined
                            }
                          />
                        )}
                        <ExplorerLink network={activeNet} hash={claimTx[p.market_id]} />
                      </div>
                    }
                  />
                ))}
              </div>
            )}
            <TechnicalDisclosure
              className="mt-4"
              rows={[
                { label: "Network", value: activeNet.chainName },
                { label: "Chain ID", value: String(activeNet.chainIdDec) },
                { label: "Explorer", value: activeNet.explorer, href: activeNet.explorer },
              ]}
            />
          </Section>

          <Section
            title="History"
            subtitle="Completed positions: winnings you have already claimed, and lost stakes."
          >
            {claimed.length === 0 && lost.length === 0 ? (
              <EmptyHint>No completed markets yet.</EmptyHint>
            ) : (
              <div className="space-y-3">
                {claimed.map((p) => (
                  <PositionRow
                    key={`won-${p.market_id}-${p.side}`}
                    p={p}
                    amountLabel={
                      p.payout_amount != null
                        ? `+${fmtUsdc(p.payout_amount)} USDC`
                        : "Claimed"
                    }
                    resolvedOutcome={p.resolved_outcome}
                    outcomeBadge={
                      <Badge className="gap-1 bg-emerald-500/20 text-emerald-300">
                        <Trophy className="h-3 w-3" /> Won · Claimed
                      </Badge>
                    }
                    subline={
                      p.claimed_at
                        ? `Claimed ${new Date(p.claimed_at).toLocaleString()}`
                        : undefined
                    }
                  />
                ))}
                {lost.map((p) => (
                  <PositionRow
                    key={`lost-${p.market_id}-${p.side}`}
                    p={p}
                    amountLabel={`-${fmtUsdc(stakedUsdc(p))} USDC`}
                    resolvedOutcome={p.resolved_outcome}
                    outcomeBadge={
                      <Badge variant="secondary" className="gap-1 text-muted-foreground">
                        <X className="h-3 w-3" /> Lost
                      </Badge>
                    }
                  />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | null;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-5 backdrop-blur">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {value === null ? (
        <div className="mt-2 font-mono text-sm text-muted-foreground">N/A</div>
      ) : (
        <div className={`mt-2 font-mono text-2xl tabular-nums ${accent ? "text-primary" : ""}`}>
          {value}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/20 p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function PositionRow({
  p,
  amountLabel,
  actionSlot,
  outcomeBadge,
  resolvedOutcome,
  highlight,
  subline,
}: {
  p: PortfolioPosition;
  amountLabel: string;
  actionSlot?: React.ReactNode;
  outcomeBadge?: React.ReactNode;
  resolvedOutcome?: "HAWK" | "DOVE" | null;
  highlight?: boolean;
  subline?: string;
}) {
  const sideClass =
    p.side === "HAWK"
      ? "bg-amber-500/20 text-amber-300"
      : "bg-sky-500/20 text-sky-300";
  return (
    <article
      className={`grid gap-4 rounded-2xl border p-5 backdrop-blur md:grid-cols-[1fr_auto] md:items-center ${
        highlight ? "border-primary/60 bg-primary/5" : "border-border/60 bg-card/40"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {p.event?.category && (
            <Badge variant="secondary" className="text-[10px]">
              {p.event.category}
            </Badge>
          )}
          <Badge className={`text-[10px] ${sideClass}`}>{p.side}</Badge>
          {resolvedOutcome && (
            <span className="font-mono text-[10px] text-muted-foreground">
              outcome: <span className="text-foreground">{resolvedOutcome}</span>
            </span>
          )}
          {outcomeBadge}
        </div>
        <h3 className="mt-2 text-base font-medium leading-snug">{marketTitle(p)}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-mono tabular-nums text-foreground">{amountLabel}</span>
          {p.event?.source_url && (
            <a
              href={p.event.source_url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-muted-foreground hover:text-foreground"
            >
              Source
            </a>
          )}
          {subline && (
            <span className="font-mono text-[11px] text-muted-foreground">{subline}</span>
          )}
        </div>
      </div>
      {actionSlot && (
        <div className="flex flex-col items-start gap-2 md:items-end">{actionSlot}</div>
      )}
    </article>
  );
}
