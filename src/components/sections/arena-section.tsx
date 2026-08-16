import { notify } from "@/lib/notify";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Bot,
  Clock,
  Gavel,
  Loader2,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { Activity, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/foundation/async-states";
import { EmptyState } from "@/components/foundation/async-states";
import { RiskBadge, ProbabilityBadge } from "@/components/foundation/risk";
import { Status } from "@/components/foundation/data";
import { TechnicalDisclosure, TestnetNotice } from "@/components/foundation/onchain";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/hooks/WalletProvider";
import { preferredNetwork } from "@/lib/arc";
import { AGENTS, type AgentSide } from "@/lib/agents";
import {
  getCachedMarkets,
  loadAgentTrackRecord,
  loadArenaMarkets,
  setCachedMarkets,
  type Market,
} from "@/lib/arena-markets";
import {
  AGENT_ARENA_ADDRESS,
  batchReadMyStakes,
  claimOnContract,
  readMarket,
  readMyStake,
  stakeOnContract,
  usdcToWei,
  type OnchainMarket,
  type OnchainStake,
} from "@/lib/agent-arena";
import { recordStake, recordClaim } from "@/lib/positions.functions";
import { rememberSessionTx } from "@/lib/wallet-tx";
import { supabaseFeed } from "@/lib/supabase-feed";
import {
  AgentPosition,
  Row,
  SectionHeader,
  formatCountdown,
  shortAddr,
} from "@/components/section-ui";

const LEGACY_DUEL_CACHE_KEYS = ["geomacro.judge.v1", "geomacro.judge.v2"];

function buildSignalBrief(m: Market): string {
  const clean = (s: string | null | undefined) =>
    (s ?? "").replace(/\s+/g, " ").trim();
  const narrative = clean(m.narrative);
  const headline = clean(m.sourceTitle);
  const base =
    narrative && narrative.length > 20
      ? narrative
      : headline
        ? `${headline}. Awaiting first positions to price the risk.`
        : "Live signal detected. Awaiting first positions to price the risk.";
  return base.length > 220 ? `${base.slice(0, 217).trimEnd()}…` : base;
}

function MarketCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur">
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-start">
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="px-6 pb-6">
        <div className="flex items-center justify-between">
          <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          <div className="h-3 w-28 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-2 h-1.5 w-full animate-pulse rounded-full bg-muted" />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/60 p-6">
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </div>
  );
}


export function ArenaSection() {
  const { address, onArc, network, connect, switchToArc, session, sessionReady, signIn, signingIn } = useWallet();
  const activeNet = network ?? preferredNetwork();

  const callRecordStake = useServerFn(recordStake);
  const callRecordClaim = useServerFn(recordClaim);

  const [stakeTx, setStakeTx] = useState<Record<string, { side: AgentSide; hash: string }>>({});
  const [now, setNow] = useState<number>(() => Date.now());
  const [pendingStake, setPendingStake] = useState<{ market: Market; side: AgentSide } | null>(null);
  const [stakeAmount, setStakeAmount] = useState<string>("10");
  const [stakeSubmitting, setStakeSubmitting] = useState(false);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [onchainMarkets, setOnchainMarkets] = useState<Record<string, OnchainMarket>>({});
  // Global agent win-rate. Single Supabase aggregate over fully finalized
  // markets only (market_resolved = true, grouped by ai_tentative_winner) —
  // not per-wallet, unaffected by claims, independent of RPC/multicall timing.
  const [trackRecord, setTrackRecord] = useState<{
    decided: number;
    HAWK: number | null;
    DOVE: number | null;
  }>({ decided: 0, HAWK: null, DOVE: null });

  useEffect(() => {
    let cancelled = false;
    void loadAgentTrackRecord().then((tr) => {
      if (!cancelled) setTrackRecord(tr);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [myStakes, setMyStakes] = useState<Record<string, OnchainStake>>({});
  const [stakesLoading, setStakesLoading] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimTx, setClaimTx] = useState<Record<string, string>>({});
  const [claimError, setClaimError] = useState<string | null>(null);
  const CLAIMED_STORAGE_PREFIX = "arena:claimed:v1:";
  const claimedStorageKey = address ? `${CLAIMED_STORAGE_PREFIX}${address.toLowerCase()}` : null;
  const [claimedMarkets, setClaimedMarkets] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    return new Set();
  });

  useEffect(() => {
    if (typeof window === "undefined" || !claimedStorageKey) {
      setClaimedMarkets(new Set());
      return;
    }
    try {
      const raw = window.localStorage.getItem(claimedStorageKey);
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        setClaimedMarkets(new Set(arr));
        return;
      }
    } catch {
      /* ignore */
    }
    setClaimedMarkets(new Set());
  }, [claimedStorageKey]);

  function markClaimed(marketId: string) {
    setClaimedMarkets((prev) => {
      const next = new Set(prev);
      next.add(marketId);
      if (typeof window !== "undefined" && claimedStorageKey) {
        try {
          window.localStorage.setItem(claimedStorageKey, JSON.stringify(Array.from(next)));
        } catch {
          /* ignore quota errors */
        }
      }
      return next;
    });
  }
  const [activeTab, setActiveTab] = useState<
    "active" | "staking_closed" | "market_resolved" | "disputed" | "completed"
  >("active");
  const [category, setCategory] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"newest" | "risk" | "closing">("newest");
  const [openBriefings, setOpenBriefings] = useState<Record<string, boolean>>({});
  const [markets, setMarkets] = useState<Market[]>([]);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const mountedAtRef = useRef<number>(Date.now());
  const marketsRef = useRef<Market[]>(markets);
  const hadCacheAtMountRef = useRef<boolean>(false);
  const previousSuccessfulHadMarketsRef = useRef<boolean>(false);
  const MIN_LOAD_MS = 2000;

  useEffect(() => {
    marketsRef.current = markets;
    if (markets.length > 0) previousSuccessfulHadMarketsRef.current = true;
  }, [markets]);

  useEffect(() => {
    try {
      for (const k of LEGACY_DUEL_CACHE_KEYS) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const cached = getCachedMarkets();
      if (marketsRef.current.length === 0 && cached?.length) {
        hadCacheAtMountRef.current = true;
        previousSuccessfulHadMarketsRef.current = true;
        marketsRef.current = cached;
        setMarkets(cached);
        setOnchainMarkets((prev) => {
          const next = { ...prev };
          for (const m of cached) next[m.id] = m.onchain;
          return next;
        });
      }
      const cachedCount = cached?.length ?? 0;
      const hasData =
        marketsRef.current.length > 0 ||
        cachedCount > 0 ||
        previousSuccessfulHadMarketsRef.current;
      if (hasData) setRefreshing(true);
      try {
        const list = await loadArenaMarkets((partial) => {
          if (cancelled) return;
          if (partial.length === 0) return;
          setMarkets((prev) => {
            const byId = new Map(prev.map((m) => [m.id, m]));
            for (const m of partial) byId.set(m.id, m);
            const merged = Array.from(byId.values());
            marketsRef.current = merged;
            return merged;
          });
          setOnchainMarkets((prev) => {
            const next = { ...prev };
            for (const m of partial) next[m.id] = m.onchain;
            return next;
          });
          previousSuccessfulHadMarketsRef.current = true;
          setInitialLoadDone(true);
        });
        if (cancelled) return;
        setMarkets(list);
        marketsRef.current = list;
        setCachedMarkets(list);
        if (list.length > 0) previousSuccessfulHadMarketsRef.current = true;
        setOnchainMarkets(() => {
          const next: Record<string, OnchainMarket> = {};
          for (const m of list) next[m.id] = m.onchain;
          return next;
        });
        setMarketsError(null);
      } catch (e) {
        if (cancelled) return;
        console.warn("[arena] market discovery failed", e);
        setMarketsError((e as Error).message || "Failed to load markets");
      } finally {
        if (!cancelled) {
          const elapsed = Date.now() - mountedAtRef.current;
          const remaining = Math.max(0, MIN_LOAD_MS - elapsed);
          if (remaining === 0) {
            setInitialLoadDone(true);
          } else {
            setTimeout(() => {
              if (!cancelled) setInitialLoadDone(true);
            }, remaining);
          }
          setRefreshing(false);
        }
      }
    }
    void refresh();
    const t = setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabaseFeed
      .channel("arena-events")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          void loadArenaMarkets((partial) => {
            if (partial.length === 0) return;
            setMarkets((prev) => {
              const byId = new Map(prev.map((m) => [m.id, m]));
              for (const m of partial) byId.set(m.id, m);
              const merged = Array.from(byId.values());
              marketsRef.current = merged;
              return merged;
            });
            setOnchainMarkets((prev) => {
              const next = { ...prev };
              for (const m of partial) next[m.id] = m.onchain;
              return next;
            });
          }).then((list) => {
            setMarkets(list);
            marketsRef.current = list;
            setCachedMarkets(list);
          }).catch(() => { /* ignore */ });
        },
      )
      .subscribe();
    return () => {
      void supabaseFeed.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!address || markets.length === 0) return;
    let cancelled = false;
    setStakesLoading(true);
    async function refresh() {
      if (!address) return;
      let stakesMap: Record<string, OnchainStake> = {};
      try {
        stakesMap = await batchReadMyStakes(
          markets.map((m) => m.id),
          address,
          undefined,
          (marketId) => markets.find((m) => m.id === marketId)?.marketAddress ?? AGENT_ARENA_ADDRESS,
        );
      } catch (e) {
        console.warn("[arena] batchReadMyStakes failed", e);
      }
      if (cancelled) return;
      setMyStakes((prev) => ({ ...prev, ...stakesMap }));
      setStakesLoading(false);
    }
    void refresh();
    const t = setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [address, markets]);

  function openStakeDialog(market: Market, side: AgentSide) {
    setStakeError(null);
    if (!address) {
      void connect();
      return;
    }
    if (!onArc) {
      void switchToArc();
      return;
    }
    // Wait for the persisted SIWE session to hydrate before prompting —
    // otherwise a re-render mid-hydration triggers a duplicate signature request.
    if (!sessionReady || signingIn) return;
    if (!session) {
      void signIn();
      return;
    }
    setStakeAmount("10");
    setPendingStake({ market, side });
  }

  async function confirmStake() {
    if (!pendingStake || !address) return;
    const amount = Number(stakeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setStakeError("Enter a positive USDC amount.");
      return;
    }
    let activeSession = session;
    if (!activeSession && sessionReady && !signingIn) {
      activeSession = await signIn();
    }
    if (!activeSession) {
        setStakeError("Sign-in required to record your stake.");
        return;
    }
    setStakeSubmitting(true);
    setStakeError(null);
    try {
      const { market, side } = pendingStake;
      // stakeOnContract() returns as soon as the wallet has broadcast the tx
      // — it does NOT wait for on-chain confirmation. This is deliberate:
      // Arc's public RPC intermittently 429s on receipt polling, and if
      // recordStake() only fired after a successful wait(), an RPC hiccup
      // would leave a real, paid-for stake missing from Supabase/Portfolio
      // (a "ghost stake"). Recording immediately off the hash means the
      // position always gets saved once the wallet confirms the tx was
      // sent, regardless of RPC flakiness. scripts/sync-stakes.js is the
      // periodic backstop that reconciles on-chain events either way.
      const { hash, confirmed } = await stakeOnContract(market.id, side, stakeAmount, market.marketAddress);
      setStakeTx((prev) => ({ ...prev, [market.id]: { side, hash } }));
      if (market.eventId) {
        try {
          await callRecordStake({
            data: {
              token: activeSession.token,
              marketId: market.eventId,
              side,
              stakedAmountRaw: usdcToWei(stakeAmount).toString(),
              txHash: hash,
            },
          });
        } catch (err) {
          console.error("[recordStake] failed", err);
        }
      }
      // Confirmation happens in the background — we don't block the UI on
      // it. If it turns out the tx actually reverted (rare, since the
      // wallet already estimated gas successfully before broadcasting), log
      // it for visibility; sync-stakes.js / anomaly-monitor.js reconcile the
      // Supabase state independently on their own schedule.
      void confirmed.then(({ success, error }) => {
        if (!success) {
          console.warn("[stake] on-chain confirmation did not complete", { marketId: market.id, error });
        }
      });
      rememberSessionTx(activeNet, address, {
        hash,
        from: address,
        to: AGENT_ARENA_ADDRESS,
        valueWei: String(BigInt(Math.round(amount * 1e6)) * BigInt(1e12)),
        timestamp: Math.floor(Date.now() / 1000),
        blockNumber: null,
        input: `stake(${market.id},${side})`,
      });
      setPendingStake(null);
      notify.success("Stake submitted", "Your position is recorded and will confirm onchain shortly.");
      setTimeout(() => {
        void (async () => {
          try {
            const om = await readMarket(market.id, undefined, market.marketAddress);
            setOnchainMarkets((prev) => ({ ...prev, [market.id]: om }));
            if (address) {
              const s = await readMyStake(market.id, address, undefined, market.marketAddress);
              setMyStakes((prev) => ({ ...prev, [market.id]: s }));
            }
          } catch {
            /* ignore */
          }
        })();
      }, 4000);
    } catch (e) {
      setStakeError(notify.error("arena.stake", e, "submitting your stake").message);
    } finally {
      setStakeSubmitting(false);
    }
  }

  async function claimWinnings(market: Market) {
    if (!address) return;
    let activeSession = session;
    if (!activeSession) {
      activeSession = await signIn();
      if (!activeSession) {
        setClaimError("Sign-in required to record your claim.");
        return;
      }
    }
    setClaiming(market.id);
    setClaimError(null);
    try {
      const hash = await claimOnContract(market.id, market.marketAddress);
      setClaimTx((prev) => ({ ...prev, [market.id]: hash }));
      if (market.eventId) {
        try {
          await callRecordClaim({
            data: { token: activeSession.token, marketId: market.eventId, txHash: hash },
          });
        } catch (err) {
          console.error("[recordClaim] failed", err);
        }
      }
      setMyStakes((prev) => ({
        ...prev,
        [market.id]: { hawkWei: 0n, doveWei: 0n, hawkUsdc: 0, doveUsdc: 0 },
      }));
      markClaimed(market.id);
      notify.success("Claim submitted", "Your winnings are on their way.");
      rememberSessionTx(activeNet, address, {
        hash,
        from: address,
        to: AGENT_ARENA_ADDRESS,
        valueWei: "0",
        timestamp: Math.floor(Date.now() / 1000),
        blockNumber: null,
        input: `claim(${market.id})`,
      });
      setTimeout(() => {
        void (async () => {
          try {
            const s = await readMyStake(market.id, address, undefined, market.marketAddress);
            setMyStakes((prev) => ({ ...prev, [market.id]: s }));
          } catch {
            /* ignore */
          }
        })();
      }, 4000);
    } catch (e) {
      const msg = (e as Error).message ?? "Claim failed";
      if (/already claimed/i.test(msg)) {
        markClaimed(market.id);
        setMyStakes((prev) => ({
          ...prev,
          [market.id]: { hawkWei: 0n, doveWei: 0n, hawkUsdc: 0, doveUsdc: 0 },
        }));
      } else {
        setClaimError(`[${market.id}] ${notify.error("arena.claim", e, "claiming your winnings").message}`);
      }
    } finally {
      setClaiming(null);
    }
  }

  const renderMarketCard = (m: Market) => {
    const om = onchainMarkets[m.id];
    const hawkUsd = Number(om ? om.hawkTotalUsdc : m.onchain.hawkTotalUsdc) || 0;
    const doveUsd = Number(om ? om.doveTotalUsdc : m.onchain.doveTotalUsdc) || 0;
    const total = hawkUsd + doveUsd;
    const result = m.briefing;
    const staked = stakeTx[m.id];
    const mine = myStakes[m.id];
    const myHawk = mine?.hawkUsdc ?? 0;
    const myDove = mine?.doveUsdc ?? 0;
    const backedSide: AgentSide | "BOTH" | null =
      myHawk > 0 && myDove > 0 ? "BOTH" : myHawk > 0 ? "HAWK" : myDove > 0 ? "DOVE" : null;
    const borderClass =
      backedSide === "HAWK"
        ? "border-destructive/60 ring-1 ring-destructive/30"
        : backedSide === "DOVE"
        ? "border-primary/60 ring-1 ring-primary/30"
        : backedSide === "BOTH"
        ? "border-accent/60 ring-1 ring-accent/30"
        : "border-border/60";
    const winnerSide = (om ?? m.onchain).winner ?? null;
    const myWinningWei = winnerSide && mine
      ? (winnerSide === "HAWK" ? mine.hawkWei : mine.doveWei)
      : 0n;
    const isFinalized =
      !!m.marketFinalized || !!(om ?? m.onchain).resolved;
    const isStakingOpen = now < m.stakingEndTime;
    const isAwaitingResolution =
      !isFinalized && !m.aiProcessed && now >= m.stakingEndTime;
    const isTentative = !isFinalized && m.aiProcessed;
    const displayWinnerSide: AgentSide | null =
      winnerSide ?? m.fullDetails?.tentativeWinner ?? m.aiTentativeWinner ?? null;
    const canClaim = !!(isFinalized && myWinningWei > 0n && !claimedMarkets.has(m.id));

    const velocity = m.severity >= 75 ? "High" : m.severity >= 50 ? "Medium" : "Low";
    let hash = 0;
    for (let i = 0; i < m.id.length; i++) hash = (hash * 31 + m.id.charCodeAt(i)) | 0;
    const jitter = ((Math.abs(hash) % 17) - 8);
    const gap = m.threshold - m.severity;
    const hawkConviction = result
      ? result.hawk.confidence
      : Math.max(35, Math.min(95,
          Math.round(55 + (m.severity - 50) * 0.6 - gap * 0.8 + jitter)
        ));
    const doveJitter = (((Math.abs(hash) >> 4) % 13) - 6);
    const doveConviction = result
      ? result.dove.confidence
      : Math.max(35, Math.min(95,
          Math.round(55 + gap * 0.8 - (m.severity - 50) * 0.4 + doveJitter)
        ));
    const velocityClass =
      velocity === "High"
        ? "text-destructive"
        : velocity === "Medium"
        ? "text-accent"
        : "text-muted-foreground";
    // Implied probability is only shown when the pool actually has volume.
    // With no positions there is no market-implied number, so we omit it
    // rather than render a fake 0% or 50%.
    const impliedEscalation = total > 0 ? (hawkUsd / total) * 100 : null;
    const marketState: { label: string; tone: "neutral" | "positive" | "warning" | "negative" } =
      isFinalized
        ? { label: "Resolved", tone: "neutral" }
        : isTentative
          ? { label: "Awaiting finalization", tone: "warning" }
          : isAwaitingResolution
            ? { label: "Closed", tone: "warning" }
            : { label: "Open", tone: "positive" };
    const briefingOpen = !!openBriefings[m.id];
    return (
      <motion.article
        key={m.id}
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className={`overflow-hidden rounded-2xl border ${borderClass} bg-card/40 backdrop-blur`}
      >
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
              <Status label={marketState.label} tone={marketState.tone} />
              {m.category && m.category.toLowerCase() !== "unknown" && (
                <span className="type-meta capitalize text-primary">{m.category}</span>
              )}
              <RiskBadge score={m.severity} showScore />
              {impliedEscalation !== null && (
                <ProbabilityBadge value={impliedEscalation} label="Escalation" />
              )}
              {m.unlinked && (
                <Badge variant="secondary" className="text-[10px]">unlinked</Badge>
              )}
            </div>
            <h3 className="mt-2 text-base font-medium leading-snug sm:text-lg">{m.question}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
              {backedSide === "HAWK" && (
                <Badge className="bg-destructive/20 text-destructive text-[10px]">
                  Position: Escalation · {myHawk.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC
                </Badge>
              )}
              {backedSide === "DOVE" && (
                <Badge className="bg-primary/20 text-primary text-[10px]">
                  Position: Calm · {myDove.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC
                </Badge>
              )}
              {backedSide === "BOTH" && (
                <>
                  <Badge className="bg-destructive/20 text-destructive text-[10px]">
                    Escalation · {myHawk.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </Badge>
                  <Badge className="bg-primary/20 text-primary text-[10px]">
                    Calm · {myDove.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </Badge>
                </>
              )}
              {address && stakesLoading && !mine && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> loading your position…
                </span>
              )}
            {isFinalized && displayWinnerSide && (
              <Badge className="text-[10px]">
                Settled · {displayWinnerSide === "HAWK" ? "Escalation" : "Calm"} resolved
              </Badge>
            )}
            {isTentative && displayWinnerSide && (
              <Badge variant="outline" className="border-accent/60 text-accent text-[10px]">
                Tentative · {displayWinnerSide === "HAWK" ? "Escalation" : "Calm"} · pending finalization
              </Badge>
            )}
            {isStakingOpen && (
              <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
                Closing in {formatCountdown(m.stakingEndTime - now)} · Result in {formatCountdown(m.resolutionAt - now)}
              </Badge>
            )}
            </div>
          </div>
          {!result && (
            <Badge
              variant="outline"
              className="gap-1.5 self-start border-border/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            >
              <Clock className="h-3.5 w-3.5" /> Briefing pending
            </Badge>
          )}
        </div>

        <div className="px-4 sm:px-5">
          <div className="rounded-xl border border-border/60 bg-background/40 p-3 sm:p-4">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                Signal Brief
              </span>
              <p className="text-sm leading-relaxed text-foreground/90 line-clamp-2">
                {buildSignalBrief(m)}
              </p>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-3">
            <div className="bg-card/60 p-3">
              <dt className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Market Volume
              </dt>
              <dd className="mt-1 font-mono text-base tabular-nums text-foreground">
                {total > 0 ? (
                  <>
                    {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    <span className="ml-1 text-[10px] text-muted-foreground">USDC</span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">No positions yet</span>
                )}
              </dd>
            </div>
            <div className="bg-card/60 p-3">
              <dt className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Attention Velocity
              </dt>
              <dd className={`mt-1 flex items-center gap-1 font-mono text-base ${velocityClass}`}>
                <Activity className="h-3.5 w-3.5" /> {velocity}
              </dd>
            </div>
            <div className="bg-card/60 p-3">
              <dt className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Updated
              </dt>
              <dd className="mt-1 font-mono text-sm text-foreground">
                {m.createdAt
                  ? new Date(m.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Unavailable"}
              </dd>
            </div>
          </dl>

          <div className="mt-3 font-mono text-[10px] text-muted-foreground">
            {om ? (
              <>
                live on-chain ·{" "}
                {om.resolved ? (
                  <span className="text-primary">
                    settled · {om.winner === "HAWK" ? "Escalation" : "Calm"} resolved
                  </span>
                ) : isTentative ? (
                  <span className="text-accent">tentative · pending finalization</span>
                ) : isAwaitingResolution ? (
                  <span>staking closed · awaiting resolver agent</span>
                ) : (
                  <span>open · accepting positions</span>
                )}
                {mine && (mine.hawkWei > 0n || mine.doveWei > 0n) && (
                  <>
                    {" "}· your position: {mine.hawkUsdc > 0 ? `${mine.hawkUsdc} Escalation` : ""}
                    {mine.hawkUsdc > 0 && mine.doveUsdc > 0 ? " · " : ""}
                    {mine.doveUsdc > 0 ? `${mine.doveUsdc} Calm` : ""}
                  </>
                )}
              </>
            ) : (
              <span className="opacity-60">on-chain order flow loads when connected to Arc</span>
            )}
          </div>
        </div>

        {result && (
          <div className="mt-4 border-t border-border/60">
            <button
              type="button"
              aria-expanded={briefingOpen}
              onClick={() =>
                setOpenBriefings((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
              }
              className="tap-target flex w-full items-center justify-between gap-3 border-b border-border/60 bg-background/40 px-4 py-2 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:px-5"
            >
              <span>Analyst briefings · two-sided view</span>
              <span className="text-foreground">{briefingOpen ? "Hide" : "Show"}</span>
            </button>
            {briefingOpen && (
              <div className="grid gap-px bg-border/60 md:grid-cols-2">
                <AgentPosition
                  side="HAWK"
                  position={result.hawk}
                  realStakeUsdc={hawkUsd}
                  realConfidence={hawkConviction}
                  trackRecord={trackRecord.HAWK}
                />
                <AgentPosition
                  side="DOVE"
                  position={result.dove}
                  realStakeUsdc={doveUsd}
                  realConfidence={doveConviction}
                  trackRecord={trackRecord.DOVE}
                />
              </div>
            )}
          </div>
        )}

        {result && !isFinalized && (
          <div className="border-t border-border/60 bg-background/60 p-4 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {isTentative
              ? "Tentative verdict recorded on-chain. Finalization pending the dispute window."
              : isAwaitingResolution
                ? "Staking closed. Resolver agent will judge shortly."
                : "Outcome hidden until market settles. Take the position your analysis supports."}
          </div>
        )}

        {!!m.resolutionAt && now >= m.resolutionAt && (
          <div className="border-t border-border/60 bg-primary/5 p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 font-mono text-xs">
                <Gavel className="h-3.5 w-3.5 text-primary" />
                <span className="uppercase tracking-widest text-primary">Resolver Agent · Verdict</span>
                {m.aiTentativeWinner && (
                  <Badge className="text-[10px]">winner: {m.aiTentativeWinner}</Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                {m.aiTentativeWinner ? (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <ShieldCheck className="h-3 w-3" /> {isFinalized ? "final" : "on-chain · tentative"}
                  </Badge>
                ) : (
                  <>
                    <Clock className="h-3.5 w-3.5 text-primary" /> Awaiting resolution
                  </>
                )}
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {m.aiReasoning ??
                "Awaiting resolution. The resolver agent runs every 2 hours and will publish the verdict on-chain."}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 p-4 sm:p-5">
          <div className="flex flex-col gap-0.5 font-mono text-[11px] text-muted-foreground">
            <span>
              {isFinalized
                ? `market settled${displayWinnerSide ? ` · ${displayWinnerSide === "HAWK" ? "Escalation" : "Calm"} resolved` : ""}`
                : isTentative
                ? `tentative · ${displayWinnerSide ? (displayWinnerSide === "HAWK" ? "Escalation" : "Calm") + " leading · " : ""}pending finalization`
                : isAwaitingResolution
                ? "staking closed · awaiting resolver agent"
                : "positions and gas settled in USDC on Arc"}
            </span>
            {!isFinalized && address && onArc && (
              <span className="text-foreground/80">trading from {shortAddr(address)}</span>
            )}
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {m.eventId && (
              <Button asChild size="sm" className="tap-target flex-1 gap-1.5 sm:flex-none">
                <Link to="/event/$eventId" params={{ eventId: m.eventId }}>
                  View event
                </Link>
              </Button>
            )}
            {canClaim && (
              <Button
                size="sm"
                onClick={() => void claimWinnings(m)}
                disabled={claiming === m.id}
                className="tap-target flex-1 gap-1.5 sm:flex-none"
              >
                {claiming === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
                {claiming === m.id ? "Settling…" : "Claim Settlement"}
              </Button>
            )}
            {!isFinalized && (
              isTentative ? (
                <div className="flex flex-col items-end gap-1.5">
                  <Badge
                    variant="outline"
                    className="gap-1.5 border-accent/60 bg-accent/10 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-accent"
                  >
                    <Gavel className="h-3.5 w-3.5" /> Pending Finalization
                  </Badge>
                  {m.marketAddress.toLowerCase() === AGENT_ARENA_ADDRESS.toLowerCase() &&
                    ((displayWinnerSide === "HAWK" && myDove > 0) ||
                      (displayWinnerSide === "DOVE" && myHawk > 0)) && (
                      <Link
                        to="/dispute/$marketId"
                        params={{ marketId: m.id }}
                        className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-accent"
                      >
                        Think this is wrong? Raise a dispute →
                      </Link>
                    )}
                </div>
              ) : !isStakingOpen ? (
                <Badge
                  variant="outline"
                  className="gap-1.5 border-border/60 bg-muted/30 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground"
                >
                  <Clock className="h-3.5 w-3.5" /> Staking Closed
                </Badge>
              ) : backedSide !== null ? (
                <Badge
                  variant="outline"
                  className="gap-1.5 border-primary/60 bg-primary/10 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-primary"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> Already Staked
                </Badge>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openStakeDialog(m, "HAWK")}
                    className="tap-target flex-1 gap-1.5 border-destructive/40 font-mono text-xs uppercase tracking-wider text-destructive hover:bg-destructive/10 hover:text-destructive sm:flex-none"
                  >
                    Long Escalation
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openStakeDialog(m, "DOVE")}
                    className="tap-target flex-1 gap-1.5 border-primary/40 font-mono text-xs uppercase tracking-wider text-primary hover:bg-primary/10 hover:text-primary sm:flex-none"
                  >
                    Long Calm
                  </Button>
                </>
              )
            )}
          </div>
        </div>

        {staked && (
          <div className="border-t border-primary/30 bg-primary/5 px-6 py-3 font-mono text-xs">
            <span className="text-primary">✓ Position opened · {staked.side === "HAWK" ? "Escalation" : "Calm"}</span>{" "}
            
              <a
                href={`${activeNet.explorer}/tx/${staked.hash}`}
              target="_blank"
              rel="noreferrer"
              className="break-all text-muted-foreground hover:text-foreground"
            >
              {staked.hash.slice(0, 18)}…
            </a>
          </div>
        )}
        {claimTx[m.id] && (
          <div className="border-t border-primary/30 bg-primary/5 px-6 py-3 font-mono text-xs">
            <span className="text-primary">✓ Claim submitted</span>{" "}
            
              <a
                href={`${activeNet.explorer}/tx/${claimTx[m.id]}`}
              target="_blank"
              rel="noreferrer"
              className="break-all text-muted-foreground hover:text-foreground"
            >
              {claimTx[m.id].slice(0, 18)}…
            </a>
          </div>
        )}
        {claimError && claimError.startsWith(`[${m.id}]`) && (
          <div className="border-t border-destructive/40 bg-destructive/10 px-6 py-3 text-xs text-destructive">
            {claimError.replace(`[${m.id}] `, "")}
          </div>
        )}
      </motion.article>
    );
  };

  const effectiveStage = (m: Market): "active" | "awaiting_dispute" | "disputed" | "completed" => {
    // lifecycle_stage is written by sync-lifecycle.js only twice per 2h cycle, so a
    // stale "active" value can outlive the staking deadline. Trust it as-is for any
    // non-"active" value (those are definitive), but for "active" (or when it hasn't
    // synced yet) fall through to the same time-based check the card badge uses.
    if (m.lifecycleStage && m.lifecycleStage !== "active") return m.lifecycleStage;
    const om = onchainMarkets[m.id] ?? m.onchain;
    const finalized = !!m.marketFinalized || !!om.resolved;
    if (finalized) return "completed";
    if (m.aiProcessed) return "awaiting_dispute";
    if (now >= m.stakingEndTime) return "awaiting_dispute";
    return "active";
  };

  // 🆕 The DB/backend lifecycle_stage only tracks 4 states — "awaiting_dispute"
  // covers both "resolver agent hasn't judged yet" and "resolver agent has
  // judged, dispute window still open". The UI already tracks that split
  // per-card via m.aiProcessed (see isAwaitingResolution/isTentative above),
  // so we reuse it here to give the tab bar 5 buckets without touching the
  // backend enum: Active / Staking Closed / Market Resolved / Dispute / Completed.
  type TabStage = "active" | "staking_closed" | "market_resolved" | "disputed" | "completed";
  const effectiveTabStage = (m: Market): TabStage => {
    const stage = effectiveStage(m);
    if (stage !== "awaiting_dispute") return stage;
    return m.aiProcessed ? "market_resolved" : "staking_closed";
  };

  // Categories are derived from real event metadata only — no hardcoded list.
  const availableCategories = Array.from(
    new Set(
      markets
        .map((m) => (m.category ?? "").trim())
        .filter((c) => c.length > 0 && c.toLowerCase() !== "unknown"),
    ),
  ).sort();

  // "Closing soon" is only offered because stakingEndTime is a real timestamp.
  const sortMarkets = (list: Market[]) => {
    const arr = [...list];
    if (sortKey === "risk") return arr.sort((a, b) => b.severity - a.severity);
    if (sortKey === "closing") {
      return arr.sort((a, b) => {
        const aOpen = a.stakingEndTime > now;
        const bOpen = b.stakingEndTime > now;
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        return a.stakingEndTime - b.stakingEndTime;
      });
    }
    return arr.sort((a, b) => b.createdAt - a.createdAt);
  };

  const visibleMarkets = sortMarkets(
    category === "all"
      ? markets
      : markets.filter((m) => (m.category ?? "").trim() === category),
  );

  const disputedMarkets = visibleMarkets.filter((m) => effectiveTabStage(m) === "disputed");
  const stakingClosedMarkets = visibleMarkets.filter((m) => effectiveTabStage(m) === "staking_closed");
  const marketResolvedMarkets = visibleMarkets.filter((m) => effectiveTabStage(m) === "market_resolved");
  const activeMarkets = visibleMarkets.filter((m) => effectiveTabStage(m) === "active");
  const openMarkets = [...disputedMarkets, ...marketResolvedMarkets, ...stakingClosedMarkets, ...activeMarkets];
  const resolvedMarkets = visibleMarkets.filter(
    (m) => effectiveTabStage(m) === "completed" && !claimedMarkets.has(m.id),
  );

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 md:py-24">
      <div className="relative">
        <SectionHeader
          as="h1"
          eyebrow="Markets"
          title="Markets"
          desc="Explore markets around events shaping the world. Every market is opened by an event in the pipeline, priced by two opposing analyst briefings, and settled automatically once the outcome is judged."
        />
        {refreshing && (
          <div className="absolute right-0 top-0 flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Refreshing…
          </div>
        )}
      </div>

      {/* Browsing never requires a wallet. Only a connected-but-wrong-network
          wallet gets a notice here; connection itself is requested at the
          action boundary inside the position dialog. */}
      {address && !onArc ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
          <span className="font-mono text-xs text-destructive">
            Wrong network. Positions settle on Arc Testnet.
          </span>
          <Button size="sm" variant="outline" onClick={() => void switchToArc()} className="tap-target gap-2">
            <Zap className="h-3.5 w-3.5" /> Switch to Arc Testnet
          </Button>
        </div>
      ) : null}

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {(Object.keys(AGENTS) as AgentSide[]).map((k) => {
          const a = AGENTS[k];
          const tone = a.color === "destructive"
            ? "border-destructive/40 bg-destructive/5"
            : "border-primary/40 bg-primary/5";
          const dot = a.color === "destructive" ? "bg-destructive" : "bg-primary";
          const acc = trackRecord[k];
          const accColor = a.color === "destructive" ? "text-destructive" : "text-primary";
          return (
            <div key={a.id} className={`rounded-2xl border ${tone} p-6`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${dot}/15`}>
                  <Bot className={`h-5 w-5 ${a.color === "destructive" ? "text-destructive" : "text-primary"}`} />
                </div>
                <div className="flex-1">
                  <div className="text-base font-medium">{a.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{a.tagline}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    Track Record
                  </div>
                  <div className={`font-mono text-xl tabular-nums ${accColor}`}>
                    {acc === null ? "N/A" : `${acc}%`}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{a.bias}</p>
            </div>
          );
        })}
      </div>

      {markets.length === 0 && !initialLoadDone ? (
        <div className="mt-10 space-y-4" aria-busy="true" aria-label="Loading markets">
          {Array.from({ length: 4 }).map((_, i) => (
            <MarketCardSkeleton key={i} />
          ))}
        </div>
      ) : markets.length === 0 && initialLoadDone && !refreshing && !hadCacheAtMountRef.current && !previousSuccessfulHadMarketsRef.current && (getCachedMarkets()?.length ?? 0) === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border/60 bg-muted/20 p-8 text-center">
          {(() => {
            try {
              const cached = getCachedMarkets();
              // eslint-disable-next-line no-console
              console.log("[arena] rendering empty state", {
                initialLoadDone,
                marketsLength: markets.length,
                hadCache: !!cached?.length,
                cacheLen: cached?.length ?? 0,
                previousSuccessfulHadMarkets: previousSuccessfulHadMarketsRef.current,
                refreshing,
                elapsedMs: Date.now() - mountedAtRef.current,
              });
            } catch { /* ignore */ }
            return null;
          })()}
          <div className="font-mono text-sm text-foreground">No live markets yet</div>
          <p className="mt-2 text-xs text-muted-foreground">
            Markets open automatically as the news pipeline detects high-severity events. Check back shortly.
          </p>
          {marketsError && (
            <p className="mt-3 font-mono text-[10px] text-destructive">{marketsError}</p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-10 space-y-10">
            <div className="flex flex-col gap-3">
              {availableCategories.length > 0 && (
                <div
                  role="group"
                  aria-label="Filter markets by category"
                  className="-mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
                >
                  {["all", ...availableCategories].map((c) => {
                    const isActive = category === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setCategory(c)}
                        className={`tap-target shrink-0 rounded-[var(--radius-control)] border px-3 py-1.5 text-xs capitalize transition ${
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/60 text-muted-foreground hover:bg-muted/40"
                        }`}
                      >
                        {c === "all" ? "All" : c}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-meta text-muted-foreground">Sort</span>
                {([
                  { key: "newest", label: "Newest" },
                  { key: "risk", label: "Highest risk" },
                  { key: "closing", label: "Closing soon" },
                ] as const).map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={sortKey === s.key}
                    onClick={() => setSortKey(s.key)}
                    className={`tap-target rounded-[var(--radius-control)] border px-3 py-1.5 text-xs transition ${
                      sortKey === s.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const tabs: Array<{
                key: "active" | "staking_closed" | "market_resolved" | "disputed" | "completed";
                label: string;
                count: number;
                destructive?: boolean;
              }> = [
                { key: "active", label: "Active", count: activeMarkets.length },
                { key: "staking_closed", label: "Staking Closed", count: stakingClosedMarkets.length },
                { key: "market_resolved", label: "Market Resolved", count: marketResolvedMarkets.length },
                { key: "disputed", label: "Dispute", count: disputedMarkets.length, destructive: true },
                { key: "completed", label: "Completed", count: resolvedMarkets.length },
              ];
              return (
                <div className="flex flex-wrap gap-2">
                  {tabs.map((t) => {
                    const isActive = activeTab === t.key;
                    const base =
                      "min-h-11 rounded-lg border px-3 py-1.5 font-mono text-xs transition sm:min-h-0";
                    const cls = t.destructive
                      ? isActive
                        ? `${base} border-destructive bg-destructive/10 text-destructive`
                        : `${base} border-destructive/50 text-destructive hover:bg-destructive/5`
                      : isActive
                        ? `${base} border-primary bg-primary/10 text-primary`
                        : `${base} border-border/60 text-muted-foreground hover:bg-muted/40`;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setActiveTab(t.key)}
                        className={cls}
                      >
                        {t.label} · {t.count}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {activeTab === "disputed" && (
              disputedMarkets.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Isolated in a 24h DAO-vote window while other markets continue on schedule.
                  </p>
                  <div className="space-y-4 rounded-2xl border border-destructive/60 bg-destructive/5 p-3 ring-1 ring-destructive/30">
                    {disputedMarkets.map((m) => (
                      <div key={m.id} className="space-y-2">
                        {m.disputerAddress && (
                          <div className="px-2 font-mono text-[11px] text-destructive">
                            Disputed by {shortAddr(m.disputerAddress)}
                          </div>
                        )}
                        {renderMarketCard(m)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center font-mono text-xs text-muted-foreground">
                  No disputed markets.
                </div>
              )
            )}

            {activeTab === "staking_closed" && (
              stakingClosedMarkets.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Staking window closed. The resolver agent hasn't judged these yet.
                  </p>
                  <div className="space-y-4">
                    {stakingClosedMarkets.map(renderMarketCard)}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center font-mono text-xs text-muted-foreground">
                  No markets waiting on the resolver agent.
                </div>
              )
            )}

            {activeTab === "market_resolved" && (
              marketResolvedMarkets.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Resolver agent has a verdict. Anyone can dispute within this window, otherwise it finalizes automatically.
                  </p>
                  <div className="space-y-4">
                    {marketResolvedMarkets.map((m) => {
                      const remaining = m.disputeWindowEndsAt ? m.disputeWindowEndsAt - now : null;
                      return (
                        <div key={m.id} className="space-y-2">
                          {remaining !== null && remaining > 0 && (
                            <div className="px-2 font-mono text-[11px] text-accent">
                              Disputes close in {formatCountdown(remaining)}
                            </div>
                          )}
                          {renderMarketCard(m)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center font-mono text-xs text-muted-foreground">
                  No resolved markets awaiting the dispute window.
                </div>
              )
            )}

            {activeTab === "active" && (
              activeMarkets.length > 0 ? (
                <div className="space-y-4">
                  {activeMarkets.map(renderMarketCard)}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center font-mono text-xs text-muted-foreground">
                  No live markets right now.
                </div>
              )
            )}

            {activeTab === "completed" && (
              resolvedMarkets.length > 0 ? (
                <div className="space-y-3 opacity-70">
                  {resolvedMarkets.map(renderMarketCard)}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center font-mono text-xs text-muted-foreground">
                  No completed markets yet.
                </div>
              )
            )}
          </div>
        </>
      )}

      <div className="mt-20 border-t border-border/60 pt-12">
        <div className="max-w-2xl">
          <div className="font-mono text-xs uppercase tracking-widest text-primary">
            The Narrative Economy
          </div>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
            Why event contracts belong in a macro book.
          </h3>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            {
              k: "01",
              title: "News as Liquidity",
              body: "Breaking global events create instant volatility. Geomacro captures this attention spike and financializes it onchain, turning every headline into a tradable contract.",
            },
            {
              k: "02",
              title: "Algorithmic Frameworks",
              body: "Agent Hawk and Agent Dove act as algorithmic market makers representing opposing global risk frameworks. Their briefings price every contract before retail capital arrives.",
            },
            {
              k: "03",
              title: "Macro Hedging",
              body: "Use event contracts to hedge real-world portfolio exposure against black swan events or geopolitical escalation. Settlement is USDC on Arc, no custodian required.",
            },
          ].map((c) => (
            <div key={c.k} className="rounded-2xl border border-border/60 bg-card/40 p-6">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {c.k}
              </div>
              <div className="mt-2 text-base font-medium text-foreground">{c.title}</div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={pendingStake !== null} onOpenChange={(o) => { if (!o) setPendingStake(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Take Position · Forecast {pendingStake?.side === "HAWK" ? "Escalation" : "Calm"}
            </DialogTitle>
            <DialogDescription>
              Review the details below. Nothing is signed until you click Confirm Position.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Outcome</span>
              <span className="text-foreground">
                {pendingStake?.side === "HAWK" ? "Escalation" : "Calm"}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-mono text-foreground">
                {Number(stakeAmount) > 0 ? `${stakeAmount} USDC` : "Enter an amount"}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Network</span>
              <span className="text-foreground">{activeNet.chainName}</span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Your amount is held by the market contract until settlement. The winning side can then
              claim its payout. No projected return is shown because the final pool is not known in
              advance.
            </p>
          </div>

          <TestnetNotice network={activeNet} />

          <div className="space-y-1.5">
            <label htmlFor="stake-amount" className="text-xs font-medium">Capital to allocate (USDC)</label>
            <Input
              id="stake-amount"
              type="number"
              min="0"
              step="0.01"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              placeholder="10"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Sent as msg.value to the AgentArena contract. USDC is the native settlement asset on Arc (18 decimals).
            </p>
          </div>

          <TechnicalDisclosure
            rows={[
              { label: "Market ID", value: pendingStake?.market.id },
              { label: "From", value: address ? shortAddr(address) : null },
              { label: "Chain ID", value: String(activeNet.chainIdDec) },
              {
                label: "Contract",
                value: AGENT_ARENA_ADDRESS,
                href: `${activeNet.explorer}/address/${AGENT_ARENA_ADDRESS}`,
              },
            ]}
          />

          {stakeError && <InlineError error={stakeError} />}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingStake(null)} disabled={stakeSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void confirmStake()} disabled={stakeSubmitting} className="gap-2">
              {stakeSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {stakeSubmitting ? "Confirming…" : "Confirm position"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
