import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { JsonRpcProvider, formatUnits } from "ethers";
import { Gavel, Loader2, LogIn, RefreshCw, Trophy, Wallet, X } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/use-wallet";
import { preferredNetwork } from "@/lib/arc";
import {
  claimOnContract,
  weiToUsdc,
} from "@/lib/agent-arena";
import {
  getMyBalanceHistory,
  getMyPositions,
  recordClaim,
  type BalanceHistoryRow,
  type PortfolioPosition,
} from "@/lib/positions.functions";
import { shortAddr } from "@/components/section-ui";
import { rememberSessionTx } from "@/lib/wallet-tx";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio · Geomacro" },
      {
        name: "description",
        content:
          "Your Agent Arena activity: wallet balance, active positions, pending claims and full history.",
      },
    ],
  }),
  component: PortfolioPage,
});

function fmtUsdc(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
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
  } = useWallet();
  const activeNet = network ?? preferredNetwork();
  const callGetPositions = useServerFn(getMyPositions);
  const callGetHistory = useServerFn(getMyBalanceHistory);
  const callRecordClaim = useServerFn(recordClaim);

  const [positions, setPositions] = useState<PortfolioPosition[] | null>(null);
  const [history, setHistory] = useState<BalanceHistoryRow[] | null>(null);
  const [balanceUsdc, setBalanceUsdc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimTx, setClaimTx] = useState<Record<string, string>>({});

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    try {
      const provider = new JsonRpcProvider(activeNet.rpcUrl);
      const bal = await provider.getBalance(address);
      setBalanceUsdc(formatUnits(bal, activeNet.currency.decimals));
    } catch (e) {
      console.warn("[portfolio] balance fetch failed", e);
    }
  }, [address, activeNet.rpcUrl, activeNet.currency.decimals]);

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

  useEffect(() => {
    if (!address) return;
    void refreshBalance();
    const id = window.setInterval(() => void refreshBalance(), 30_000);
    return () => window.clearInterval(id);
  }, [address, refreshBalance]);

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
    return history.map((h) => ({
      ts: new Date(h.created_at).getTime(),
      date: new Date(h.created_at).toLocaleDateString(),
      balance: Number(h.balance ?? 0),
      delta: Number(h.amount_delta ?? 0),
      type: h.event_type,
    }));
  }, [history]);

  async function handleClaim(p: PortfolioPosition) {
    if (!session) return;
    setClaimError(null);
    setClaiming(p.market_id);
    try {
      const onchainMarketId = `mkt_${p.market_id}`;
      const hash = await claimOnContract(onchainMarketId);
      setClaimTx((prev) => ({ ...prev, [p.market_id]: hash }));
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
        to: null,
        valueWei: "0",
        timestamp: Math.floor(Date.now() / 1000),
        blockNumber: null,
        input: `claim(${onchainMarketId})`,
      });
      setTimeout(() => {
        void refresh(true);
        void refreshBalance();
      }, 1500);
    } catch (e) {
      const msg = (e as Error).message ?? "Claim failed";
      setClaimError(`[${p.market_id.slice(0, 8)}…] ${msg}`);
    } finally {
      setClaiming(null);
    }
  }

  // --- AUTH GATE ---

  if (!address) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Connect your wallet</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your portfolio is fully on-chain. Connect a wallet to view your positions, pending claims and balance history.
        </p>
        <Button className="mt-6 gap-2" onClick={() => void connect()} disabled={connecting}>
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          {connecting ? "Connecting…" : "Connect Wallet"}
        </Button>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <LogIn className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Sign in with your wallet</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sign a gasless message from <span className="font-mono text-foreground">{shortAddr(address)}</span> to prove ownership. Nothing is spent, no transaction is sent.
        </p>
        <Button className="mt-6 gap-2" onClick={() => void signIn()} disabled={signingIn}>
          {signingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {signingIn ? "Waiting for signature…" : "Sign in with wallet"}
        </Button>
      </main>
    );
  }

  // --- MAIN CONTENT ---

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-primary">Portfolio</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Your Arena activity</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as <span className="font-mono text-foreground">{shortAddr(address)}</span> on {activeNet.chainName}.
          </p>
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
              <Loader2 className="h-4 w-4 animate-spin" /> Reading…
            </div>
          ) : (
            <div className="mt-2 font-mono text-3xl tabular-nums">
              {fmtUsdc(Number(balanceUsdc))}{" "}
              <span className="text-sm text-muted-foreground">USDC</span>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Live on-chain balance on {activeNet.chainName}.
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/40 p-5 backdrop-blur lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Balance History
            </div>
            {history && (
              <div className="font-mono text-[10px] text-muted-foreground">
                {history.length} event{history.length === 1 ? "" : "s"}
              </div>
            )}
          </div>
          {history === null ? (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
            </div>
          ) : chartData.length === 0 ? (
            <EmptyHint>No activity yet.</EmptyHint>
          ) : (
            <div className="mt-4 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bal-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" strokeOpacity={0.12} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }}
                    stroke="currentColor"
                    opacity={0.4}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }}
                    stroke="currentColor"
                    opacity={0.4}
                    width={50}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="3 3" />
                  <Tooltip
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
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#bal-fill)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    isAnimationActive={false}
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
                      <div className="flex flex-col items-end gap-1">
                        <Button
                          size="sm"
                          onClick={() => void handleClaim(p)}
                          disabled={claiming === p.market_id}
                          className="gap-2"
                        >
                          {claiming === p.market_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Gavel className="h-4 w-4" />
                          )}
                          {claiming === p.market_id ? "Claiming…" : "Claim"}
                        </Button>
                        {claimTx[p.market_id] && (
                          <a
                            className="font-mono text-[10px] text-primary underline-offset-4 hover:underline"
                            href={`${activeNet.explorer}/tx/${claimTx[p.market_id]}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            ✓ tx {claimTx[p.market_id].slice(0, 12)}…
                          </a>
                        )}
                      </div>
                    }
                  />
                ))}
              </div>
            )}
            {claimError && <p className="mt-3 text-xs text-destructive">{claimError}</p>}
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
    </main>
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
        <div className="mt-2 font-mono text-sm text-muted-foreground">—</div>
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