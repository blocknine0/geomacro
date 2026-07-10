import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  Brain,
  Clock,
  Gavel,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Swords,
  Wallet,
  Zap,
} from "lucide-react";
import { Activity, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  loadArenaMarkets,
  setCachedMarkets,
  type Market,
} from "@/lib/arena-markets";
import {
  AGENT_ARENA_ADDRESS,
  claimOnContract,
  readMarket,
  readMyStake,
  stakeOnContract,
  usdcToWei,
  type OnchainMarket,
  type OnchainStake,
} from "@/lib/agent-arena";
import { runAgentDuel } from "@/lib/agents.functions";
import { mainAgentJudge } from "@/lib/arena-judge.functions";
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

/**
 * Two-line news gist shown in place of the implied-probability panel while
 * a market has no liquidity. Prefers the linked event narrative, falls back
 * to the source headline, then a neutral default. Keeps output tight so it
 * fits the ~2 line clamp in the card.
 */
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

function friendlyAgentError(err: unknown, kind: "duel" | "judge"): string {
  const msg = (err as Error)?.message ?? "";
  const code = msg.split(":")[0]?.trim();
  switch (code) {
    case "MISSING_GROQ_KEY":
      return "AI service is not configured (missing GROQ_API_KEY). Ask the admin to set it.";
    case "GROQ_TIMEOUT":
      return kind === "judge"
        ? "Main agent timed out fetching the verdict. Try again."
        : "AI duel timed out. Try again.";
    case "GROQ_RATE_LIMITED":
      return "AI service is rate-limited. Wait ~30s and retry.";
    case "GROQ_AUTH":
      return "AI service rejected the API key. Admin must rotate GROQ_API_KEY.";
    case "GROQ_BAD_REQUEST":
      return "AI service rejected the request payload.";
    case "GROQ_SERVER":
    case "GROQ_NETWORK":
      return "AI service is temporarily unavailable. Try again in a moment.";
    case "GROQ_BAD_JSON":
    case "GROQ_EMPTY":
    case "VERDICT_SCHEMA_INVALID":
    case "DUEL_SCHEMA_INVALID":
      return "AI returned an unexpected response. Try again.";
    case "Too many requests":
      return "You're sending too many requests. Wait a minute and retry.";
    case "Forbidden":
      return "Blocked by origin guard. Reload the page and retry.";
    case "AI service unavailable":
      return "AI service is not configured. Ask the admin to set GROQ_API_KEY.";
  }
  if (kind === "judge") return `Main agent unavailable${msg ? `: ${msg}` : ""}. Try again in a moment.`;
  return msg || "Agent duel unavailable. Please try again.";
}

export function ArenaSection() {
  const { address, onArc, network, connect, switchToArc, session, signIn } = useWallet();
  const activeNet = network ?? preferredNetwork();

  const duel = useServerFn(runAgentDuel);
  const judge = useServerFn(mainAgentJudge);
  const callRecordStake = useServerFn(recordStake);
  const callRecordClaim = useServerFn(recordClaim);

  const [duelLoading, setDuelLoading] = useState<string | null>(null);
  const [duelError, setDuelError] = useState<string | null>(null);
  const [duels, setDuels] = useState<Record<string, Awaited<ReturnType<typeof runAgentDuel>>>>({});
  const [verdicts, setVerdicts] = useState<Record<string, Awaited<ReturnType<typeof mainAgentJudge>>>>({});
  const [judging, setJudging] = useState<string | null>(null);
  const [stakeTx, setStakeTx] = useState<Record<string, { side: AgentSide; hash: string }>>({});
  const [now, setNow] = useState<number>(() => Date.now());
  const autoJudgedRef = useRef<Set<string>>(new Set());
  const [pendingStake, setPendingStake] = useState<{ market: Market; side: AgentSide } | null>(null);
  const [stakeAmount, setStakeAmount] = useState<string>("10");
  const [stakeSubmitting, setStakeSubmitting] = useState(false);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [onchainMarkets, setOnchainMarkets] = useState<Record<string, OnchainMarket>>({});
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

  // Hydrate claimed-market set from localStorage whenever the wallet changes.
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
  const [showResolved, setShowResolved] = useState(false);
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

  // Duel + verdict cache is session-only (in-memory). Purge any legacy
  // localStorage payloads from previous builds so stale results don't leak
  // across sessions.
  useEffect(() => {
    try {
      for (const k of LEGACY_DUEL_CACHE_KEYS) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }, []);

  // 1s ticker drives countdowns + auto-judge trigger
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Discover markets from on-chain MarketCreated logs + getMarket reads.
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
          // Stream partial results so the first markets render immediately
          // without waiting for the slowest RPC read.
          setMarkets((prev) => {
            // Merge by id, prefer partial entries (they're freshest).
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
          // End the skeleton as soon as we have something to show.
          setInitialLoadDone(true);
        });
        if (cancelled) return;
        // Supabase is now the authoritative source for visible markets. Always
        // replace the UI with the latest database result so deleted duplicates
        // cannot survive from memory or old cache state.
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

  // Supabase Realtime: the backend ingest/create/resolve/finalize cron jobs
  // write to `events` roughly every 2h. Subscribe so `market_created`,
  // `ai_processed`, `ai_tentative_winner` and `market_resolved` flips reach
  // the UI without waiting for the 30s polling tick.
  useEffect(() => {
    const channel = supabaseFeed
      .channel("arena-events")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          // Kick a background refresh; the effect above already streams
          // partial results so the UI updates incrementally.
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

  // Refresh per-wallet stakes whenever address / network / market set changes.
  useEffect(() => {
    if (!address || markets.length === 0) return;
    let cancelled = false;
    setStakesLoading(true);
    async function refresh() {
      if (!address) return;
      const settled = await Promise.allSettled(
        markets.map((m) => readMyStake(m.id, address)),
      );
      if (cancelled) return;
      const next: Record<string, OnchainStake> = {};
      markets.forEach((m, i) => {
        const r = settled[i];
        if (r.status === "fulfilled") {
          next[m.id] = r.value;
          // eslint-disable-next-line no-console
          console.log(
            `[arena] stake loaded for ${m.id}: hawk=${r.value.hawkUsdc} dove=${r.value.doveUsdc}`,
          );
        }
      });
      setMyStakes((prev) => ({ ...prev, ...next }));
      setStakesLoading(false);
    }
    void refresh();
    const t = setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [address, markets]);

  // Auto-judge whenever a market's resolution window elapses
  useEffect(() => {
    for (const m of markets) {
      const dl = m.resolutionAt;
      if (!dl || now < dl) continue;
      if (verdicts[m.id]) continue;
      if (!duels[m.id]) continue;
      if (judging === m.id) continue;
      if (autoJudgedRef.current.has(m.id)) continue;
      autoJudgedRef.current.add(m.id);
      void judgeMarket(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, duels, verdicts, judging, markets]);

  async function runDuel(m: Market, force = false) {
    // In-memory cache: if a duel result is already in state for this market,
    // reuse it instead of calling Groq again. The user can force a refresh
    // via the "Refresh duel" button.
    if (!force && duels[m.id]) return;
    setDuelLoading(m.id);
    setDuelError(null);
    try {
      const res = await duel({
        data: {
          marketId: m.id,
          question: m.question,
          threshold: m.threshold,
          eventNarrative: m.narrative,
          eventSeverity: m.severity,
          eventStage: m.stage,
          category: m.category,
          sourceTitle: m.sourceTitle ?? undefined,
        },
      });
      setDuels((prev) => ({ ...prev, [m.id]: res }));
      setVerdicts((prev) => {
        const next = { ...prev };
        delete next[m.id];
        return next;
      });
      autoJudgedRef.current.delete(m.id);
    } catch (e) {
      console.error("[runDuel] failed", e);
      setDuelError(`[${m.id}] ${friendlyAgentError(e, "duel")}`);
    } finally {
      setDuelLoading(null);
    }
  }

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
    if (!activeSession) {
      activeSession = await signIn();
      if (!activeSession) {
        setStakeError("Sign-in required to record your stake.");
        return;
      }
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
      const { hash, confirmed } = await stakeOnContract(market.id, side, stakeAmount);
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
      setTimeout(() => {
        void (async () => {
          try {
            const om = await readMarket(market.id);
            setOnchainMarkets((prev) => ({ ...prev, [market.id]: om }));
            if (address) {
              const s = await readMyStake(market.id, address);
              setMyStakes((prev) => ({ ...prev, [market.id]: s }));
            }
          } catch {
            /* ignore */
          }
        })();
      }, 4000);
    } catch (e) {
      setStakeError((e as Error).message ?? "Transaction rejected");
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
      const hash = await claimOnContract(market.id);
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
      // Optimistically zero out the stake so the claim button disappears
      // immediately and the market drops out of the UI without waiting for
      // the next on-chain read.
      setMyStakes((prev) => ({
        ...prev,
        [market.id]: { hawkWei: 0n, doveWei: 0n, hawkUsdc: 0, doveUsdc: 0 },
      }));
      markClaimed(market.id);
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
            const s = await readMyStake(market.id, address);
            setMyStakes((prev) => ({ ...prev, [market.id]: s }));
          } catch {
            /* ignore */
          }
        })();
      }, 4000);
    } catch (e) {
      const msg = (e as Error).message ?? "Claim failed";
      if (/already claimed/i.test(msg)) {
        // Contract says this user already claimed. Persist that and hide the button.
        markClaimed(market.id);
        setMyStakes((prev) => ({
          ...prev,
          [market.id]: { hawkWei: 0n, doveWei: 0n, hawkUsdc: 0, doveUsdc: 0 },
        }));
      } else {
        setClaimError(`[${market.id}] ${msg}`);
      }
    } finally {
      setClaiming(null);
    }
  }

  async function judgeMarket(m: Market) {
    const duelRes = duels[m.id];
    if (!duelRes) {
      setDuelError("Run the AI duel first so the main agent has positions to judge.");
      return;
    }
    setJudging(m.id);
    setDuelError(null);
    try {
      const v = await judge({
        data: {
          marketId: m.id,
          question: m.question,
          topic: m.narrative ?? m.question,
          threshold: m.threshold,
          hawk: {
            side: duelRes.hawk.side,
            confidence: duelRes.hawk.confidence,
            stakeUsdc: duelRes.hawk.stakeUsdc,
            rationale: duelRes.hawk.rationale,
          },
          dove: {
            side: duelRes.dove.side,
            confidence: duelRes.dove.confidence,
            stakeUsdc: duelRes.dove.stakeUsdc,
            rationale: duelRes.dove.rationale,
          },
          pastCalibration: null,
        },
      });
      setVerdicts((p) => ({ ...p, [m.id]: v }));
    } catch (e) {
      console.error("[judgeMarket] failed", e);
      setDuelError(`[${m.id}] ${friendlyAgentError(e, "judge")}`);
    } finally {
      setJudging(null);
    }
  }

  const renderMarketCard = (m: Market) => {
    const om = onchainMarkets[m.id];
    const hawkUsd = Number(om ? om.hawkTotalUsdc : m.onchain.hawkTotalUsdc) || 0;
    const doveUsd = Number(om ? om.doveTotalUsdc : m.onchain.doveTotalUsdc) || 0;
    const total = hawkUsd + doveUsd;
    const result = duels[m.id];
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
    // A market is only "settled" (safe to display a final winner + enable
    // claim) once it's FINALIZED on-chain or Supabase confirms
    // market_resolved. AI-tentative winners are labeled separately.
    const isFinalized =
      !!m.marketFinalized || !!(om ?? m.onchain).resolved;
    const isStakingOpen = now < m.stakingEndTime;
    const isAwaitingResolution =
      !isFinalized && !m.aiProcessed && now >= m.stakingEndTime;
    const isTentative = !isFinalized && m.aiProcessed;
    // Prefer on-chain final winner, else the DB-tracked tentative winner.
    const displayWinnerSide: AgentSide | null =
      winnerSide ?? m.fullDetails?.tentativeWinner ?? m.aiTentativeWinner ?? null;
    const canClaim = !!(isFinalized && myWinningWei > 0n && !claimedMarkets.has(m.id));
    const velocity = m.severity >= 75 ? "High" : m.severity >= 50 ? "Medium" : "Low";
    // Deterministic per-market conviction derived from severity vs threshold
    // (plus a small per-id jitter) so each market shows a distinct, sensible
    // Hawk/Dove split instead of the model's near-constant 80/70.
    let hash = 0;
    for (let i = 0; i < m.id.length; i++) hash = (hash * 31 + m.id.charCodeAt(i)) | 0;
    const jitter = ((Math.abs(hash) % 17) - 8); // -8..+8
    const gap = m.threshold - m.severity; // smaller gap → easier to escalate
    const hawkConviction = Math.max(35, Math.min(95,
      Math.round(55 + (m.severity - 50) * 0.6 - gap * 0.8 + jitter)
    ));
    const doveJitter = (((Math.abs(hash) >> 4) % 13) - 6); // -6..+6
    const doveConviction = Math.max(35, Math.min(95,
      Math.round(55 + gap * 0.8 - (m.severity - 50) * 0.4 + doveJitter)
    ));
    const velocityClass =
      velocity === "High"
        ? "text-destructive"
        : velocity === "Medium"
        ? "text-accent"
        : "text-muted-foreground";
    return (
      <motion.article
        key={m.id}
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className={`overflow-hidden rounded-2xl border ${borderClass} bg-card/40 backdrop-blur`}
      >
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              {m.unlinked && (
                <Badge variant="secondary" className="text-[10px]">unlinked</Badge>
              )}
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
            {isAwaitingResolution && (
              <Badge variant="outline" className="text-[10px]">
                Staking closed · awaiting resolution
              </Badge>
            )}
            {isStakingOpen && (
              <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
                Closing in {formatCountdown(m.stakingEndTime - now)} · Result in {formatCountdown(m.resolutionAt - now)}
              </Badge>
            )}
            </div>
            <h3 className="mt-2 text-lg font-medium leading-snug">{m.question}</h3>
          </div>
          {result ? (
            <div className="flex items-center gap-2 self-start">
              <Button
                size="sm"
                variant="outline"
                onClick={() => runDuel(m, true)}
                disabled={duelLoading === m.id}
                className="gap-1.5"
                title="Regenerate analyst briefings"
              >
                {duelLoading === m.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {duelLoading === m.id ? "Refreshing…" : "Refresh briefings"}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => runDuel(m)}
              disabled={duelLoading === m.id}
              className="gap-2 self-start"
            >
              {duelLoading === m.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Swords className="h-4 w-4" />
              )}
              {duelLoading === m.id ? "Analysts drafting…" : "Generate Briefings"}
            </Button>
          )}
        </div>

        {duelError && duelError.startsWith(`[${m.id}]`) && (
          <div className="mx-6 -mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {duelError.replace(`[${m.id}] `, "")}
          </div>
        )}

        <div className="px-6">
          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            {/* Implied Probability bar intentionally removed for all users,
                permanently — showing the live odds split lets people just
                follow the existing skew instead of forming their own view,
                which defeats the purpose of the market. Always show a
                neutral qualitative brief instead. */}
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                Signal Brief
              </span>
              <p className="text-sm leading-relaxed text-foreground/90 line-clamp-2">
                {buildSignalBrief(m)}
              </p>
            </div>
          </div>

          {/* Narrative Matrix */}
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60">
            <div className="bg-card/60 p-3">
              <dt className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Narrative Volume
              </dt>
              <dd className="mt-1 font-mono text-base tabular-nums text-foreground">
                {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                <span className="ml-1 text-[10px] text-muted-foreground">USDC</span>
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
          </dl>

          <div className="mt-3 font-mono text-[10px] text-muted-foreground">
            {om ? (
              <>
                live on-chain ·{" "}
                {om.resolved ? (
                  <span className="text-primary">
                    settled · {om.winner === "HAWK" ? "Escalation" : "Calm"} resolved
                  </span>
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
          <div className="mt-6 border-t border-border/60">
            <div className="flex items-center justify-between border-b border-border/60 bg-background/40 px-6 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span>Analyst Briefings · Market Research Notes</span>
              <span>Two-Sided View</span>
            </div>
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

        {isFinalized && result && (
          <div className="flex items-start gap-3 border-t border-border/60 bg-background/60 p-6">
            <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="flex-1">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="uppercase tracking-widest text-accent">Resolver Agent · Settlement Note</span>
                <Badge className="text-[10px]">winner: {displayWinnerSide ?? result.resolverVerdict.winner}</Badge>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{result.resolverVerdict.reasoning}</p>
            </div>
          </div>
        )}

        {isFinalized && (
          <div className="border-t border-border/60 bg-primary/5 p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 font-mono text-xs">
                <Brain className="h-3.5 w-3.5 text-primary" />
                <span className="uppercase tracking-widest text-primary">Main Agent · Settlement Verdict</span>
                {verdicts[m.id] && (
                  <Badge className="text-[10px]">
                    {verdicts[m.id].winner} · {verdicts[m.id].confidence}%
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                {verdicts[m.id] ? (
                  <Badge variant="secondary" className="gap-1 text-[10px]"><ShieldCheck className="h-3 w-3" /> auto-decided</Badge>
                ) : judging === m.id ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Main agent deciding…</>
                ) : m.resolutionAt && now < m.resolutionAt ? (
                  <><Clock className="h-3.5 w-3.5 text-primary" /> auto-verdict in {formatCountdown(m.resolutionAt - now)}</>
                ) : null}
              </div>
            </div>
            {!verdicts[m.id] && m.resolutionAt && now < m.resolutionAt && (
              <div className="mt-3">
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(0, 100 - ((m.resolutionAt - now) / Math.max(1, m.resolutionAt - m.createdAt)) * 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Prediction window runs until resolution. Main agent will pull live NewsAPI headlines + hybrid-score against hawk/dove positions and historical calibration, then declare a winner automatically.
                </p>
              </div>
            )}
            {verdicts[m.id] && (
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-foreground">{verdicts[m.id].reasoning}</p>
                <p className="text-xs text-muted-foreground">📰 {verdicts[m.id].newsAlignment}</p>
                <p className="text-xs text-muted-foreground">🎯 {verdicts[m.id].calibrationNote}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 p-6">
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
          <div className="flex gap-2">
            {canClaim && (
              <Button
                size="sm"
                onClick={() => void claimWinnings(m)}
                disabled={claiming === m.id}
                className="gap-1.5"
              >
                {claiming === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
                {claiming === m.id ? "Settling…" : "Claim Settlement"}
              </Button>
            )}
            {!isFinalized && (
              !isStakingOpen ? (
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
                    className="gap-1.5 border-destructive/40 font-mono text-xs uppercase tracking-wider text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    Long Escalation
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openStakeDialog(m, "DOVE")}
                    className="gap-1.5 border-primary/40 font-mono text-xs uppercase tracking-wider text-primary hover:bg-primary/10 hover:text-primary"
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

  // Coarse lifecycle bucket per market, preferring the freshest polled
  // on-chain status (onchainMarkets) over the snapshot taken at load time.
  const stageOf = (m: Market): Market["lifecycleStage"] => {
    const live = onchainMarkets[m.id];
    if (live) {
      switch (live.status) {
        case 3:
          return "disputed";
        case 4:
          return "completed";
        case 2:
          return "awaiting_dispute";
        default:
          return "active";
      }
    }
    return m.lifecycleStage;
  };

  const activeMarkets = markets.filter((m) => stageOf(m) === "active");
  const awaitingDisputeMarkets = markets.filter((m) => stageOf(m) === "awaiting_dispute");
  const disputedMarkets = markets.filter((m) => stageOf(m) === "disputed");
  const resolvedMarkets = markets.filter(
    (m) => stageOf(m) === "completed" && !claimedMarkets.has(m.id),
  );

  // Forecast Track Record: derive each analyst's predictive accuracy from
  // resolved on-chain markets. HAWK is right when the resolved winner is
  // HAWK (escalation), DOVE is right when the winner is DOVE (calm).
  const trackRecord = (() => {
    let hawkWins = 0;
    let doveWins = 0;
    let decided = 0;
    for (const m of resolvedMarkets) {
      const w = (onchainMarkets[m.id] ?? m.onchain).winner;
      if (w === "HAWK") {
        hawkWins += 1;
        decided += 1;
      } else if (w === "DOVE") {
        doveWins += 1;
        decided += 1;
      }
    }
    const fmt = (n: number) =>
      decided === 0 ? null : Math.round((n / decided) * 100);
    return {
      decided,
      HAWK: fmt(hawkWins),
      DOVE: fmt(doveWins),
    };
  })();

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 md:py-24">
      <div className="relative">
        <SectionHeader
          eyebrow="Analyst Panel · Market Research Notes"
          title="Two algorithmic analysts. Opposing risk frameworks. One settled contract."
          desc="Every contract opens with two formal research notes from Agent Hawk and Agent Dove, taking opposite sides of the same event. Read the briefings, weigh the implied probability and take a position in USDC on Arc. Forty-eight hours later the main resolver agent re-reads the news, judges which call aged better and the contract settles the winning side automatically."
        />
        {refreshing && (
          <div className="absolute right-0 top-0 flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Refreshing…
          </div>
        )}
      </div>

      {!address ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          <span className="font-mono text-xs text-muted-foreground">
            Connect wallet to take positions in the Intelligence Panel.
          </span>
          <Button size="sm" onClick={connect} className="gap-2">
            <Wallet className="h-4 w-4" /> Connect wallet
          </Button>
        </div>
      ) : !onArc ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
          <span className="font-mono text-xs text-destructive">
            Wrong network. Positions settle on Arc Testnet.
          </span>
          <Button size="sm" variant="outline" onClick={() => void switchToArc()} className="gap-2">
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
                    {acc === null ? "—" : `${acc}%`}
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
          {disputedMarkets.length > 0 && (
            <div className="mt-10 rounded-2xl border border-destructive/50 bg-destructive/5 p-5">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-destructive">
                <Gavel className="h-3.5 w-3.5" />
                Disputed · {disputedMarkets.length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Someone staked the dispute fee on these markets. They're isolated in a
                24h DAO-vote window — every other market keeps resolving on its normal
                schedule.
              </p>
              <div className="mt-4 space-y-4">{disputedMarkets.map(renderMarketCard)}</div>
            </div>
          )}

          {awaitingDisputeMarkets.length > 0 && (
            <div className="mt-10">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                Awaiting dispute window · {awaitingDisputeMarkets.length}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Agent verdict is in. Anyone can dispute within the window — otherwise
                these finalize automatically once it closes.
              </p>
              <div className="mt-4 space-y-4">{awaitingDisputeMarkets.map(renderMarketCard)}</div>
            </div>
          )}

          <div className="mt-10">
            {(disputedMarkets.length > 0 || awaitingDisputeMarkets.length > 0) && (
              <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                Active · {activeMarkets.length}
              </div>
            )}
            <div className="space-y-4">
              {activeMarkets.length > 0 ? (
                activeMarkets.map(renderMarketCard)
              ) : !refreshing && !hadCacheAtMountRef.current && !previousSuccessfulHadMarketsRef.current && (getCachedMarkets()?.length ?? 0) === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center font-mono text-xs text-muted-foreground">
                  No active markets right now. Browse settled markets below.
                </div>
              ) : null}
            </div>
          </div>

          {resolvedMarkets.length > 0 && (
            <div className="mt-12 border-t border-border/40 pt-6">
              <button
                type="button"
                onClick={() => setShowResolved((s) => !s)}
                className="flex w-full items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-4 py-2.5 text-left font-mono text-xs text-muted-foreground transition hover:bg-muted/40"
              >
                <span>Completed markets · {resolvedMarkets.length}</span>
                <span className="text-foreground/80">{showResolved ? "Hide" : "Show"}</span>
              </button>
              {showResolved && (
                <div className="mt-4 space-y-3 opacity-70">
                  {resolvedMarkets.map(renderMarketCard)}
                </div>
              )}
            </div>
          )}
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

          <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs">
            <div className="font-mono font-medium text-primary">Live on Arc Testnet</div>
            <p className="text-muted-foreground">
              Confirming will send <strong>{stakeAmount || "0"} USDC</strong> as <code>msg.value</code> to the
              AgentArena contract&apos;s <code>stake(marketId, side)</code> function. Funds are held in
              the contract until the market settles. The winning side can then claim their settlement payout.
            </p>
            <div className="break-all font-mono text-[10px] text-muted-foreground">
              contract: {AGENT_ARENA_ADDRESS}
            </div>
          </div>

          <div className="space-y-2 font-mono text-xs">
            <Row k="Market" v={pendingStake?.market.id ?? ""} mono />
            <Row k="Forecast" v={pendingStake?.side === "HAWK" ? "Escalation" : pendingStake?.side === "DOVE" ? "Calm" : ""} mono />
            <Row k="From" v={address ? shortAddr(address) : ""} mono />
            <Row k="Network" v={activeNet.chainName} mono />
            <Row k="Contract" v={`${AGENT_ARENA_ADDRESS.slice(0, 10)}…${AGENT_ARENA_ADDRESS.slice(-6)}`} mono />
          </div>

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

          {stakeError && <p className="text-xs text-destructive">{stakeError}</p>}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingStake(null)} disabled={stakeSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void confirmStake()} disabled={stakeSubmitting} className="gap-2">
              {stakeSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm Position
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
