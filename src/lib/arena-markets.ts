import { ARC_TESTNET, getArcReadProvider } from "./arc";
import {
  batchReadMarkets,
  batchReadMarketFullDetails,
  STAKING_TO_RESOLUTION_BUFFER_MS,
  type OnchainMarket,
  type OnchainMarketFullDetails,
} from "./agent-arena";
import { supabaseFeed, type StoredEventRow } from "./supabase-feed";
import { normalizeEventStage, type EventStage } from "./event-stage";
import type { AgentSide } from "./agents";

/** Analyst briefing persisted in Supabase by the scheduled backend job.
 *  Generated exactly once per market — the frontend only reads it. */
export type MarketBriefingPosition = {
  side: "YES" | "NO";
  confidence: number;
  stakeUsdc: number;
  rationale: string;
};
export type MarketBriefing = {
  hawk: MarketBriefingPosition;
  dove: MarketBriefingPosition;
  generatedAt: string | null;
};

function buildBriefing(row: StoredEventRow): MarketBriefing | null {
  const hawk = row.hawk_reasoning?.trim();
  const dove = row.dove_reasoning?.trim();
  if (!hawk || !dove) return null;
  const clampConf = (v: number | null | undefined, fallback: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.max(0, Math.min(100, Math.round(v)))
      : fallback;
  return {
    hawk: {
      side: "YES",
      confidence: clampConf(row.hawk_conviction, 50),
      stakeUsdc: 0,
      rationale: hawk,
    },
    dove: {
      side: "NO",
      confidence: clampConf(row.dove_conviction, 50),
      stakeUsdc: 0,
      rationale: dove,
    },
    generatedAt: row.briefing_generated_at ?? null,
  };
}

/**
 * One row in the Agent Arena UI. Everything here is derived from on-chain
 * state (MarketCreated logs + getMarket) plus an optional Supabase event row
 * that gives the market human-readable context. We intentionally hold no
 * hardcoded pool numbers or descriptions — the contract is the source of
 * truth.
 */
export type Market = {
  /** marketId as emitted by the AgentArena contract. */
  id: string;
  /** Supabase event uuid parsed from the marketId, if it followed the
   *  `mkt_<event_uuid>` convention the publisher uses. Null otherwise. */
  eventId: string | null;
  /** Display question shown on the card. */
  question: string;
  /** Long-form narrative from the Supabase event row, or a fallback. */
  narrative: string;
  /** Pipeline stage label, always one of EVENT_STAGES. */
  stage: EventStage;
  /** Severity (0-100) from the Supabase event row, defaults to 70. */
  severity: number;
  /** News category from the Supabase event row, or "unknown". */
  category: string;
  /** Severity threshold the duel is evaluated against. Derived from
   *  severity since the on-chain contract doesn't store one. */
  threshold: number;
  sourceUrl: string | null;
  sourceTitle: string | null;
  /** True when no Supabase row backed this marketId. */
  unlinked: boolean;
  /** Exact resolution timestamp (ms) from Supabase events.resolution_at,
   *  falling back to created_at + 48h for legacy rows. */
  resolutionAt: number;
  /** Staking cutoff (ms). Prefers on-chain stakingEndTime; falls back to
   *  resolutionAt - 2h (the contract-enforced 46h/48h split). */
  stakingEndTime: number;
  /** Event creation timestamp (ms) for progress-bar reference. */
  createdAt: number;
  /** Latest on-chain snapshot (totals, status, winner). */
  onchain: OnchainMarket;
  /** Extended on-chain state when available (status, tentative winner,
   *  authoritative times). Null on RPC failure or older deployments. */
  fullDetails: OnchainMarketFullDetails | null;
  /** AI has judged the market on-chain, but finalization is still pending
   *  the dispute window. UI must label the winner as tentative. */
  aiProcessed: boolean;
  /** AI's provisional winner from Supabase (`events.ai_tentative_winner`).
   *  Only trust as final when `marketFinalized` is true. */
  aiTentativeWinner: AgentSide | null;
  /** Reasoning from the backend resolver (`events.ai_reasoning`). Null until
   *  the 2-hourly resolution cron has judged the market. */
  aiReasoning: string | null;
  /** True once the market is fully settled (status FINALIZED on-chain or
   *  `events.market_resolved` in Supabase). */
  marketFinalized: boolean;
  /** DB-authoritative lifecycle stage. Null for older rows — callers must
   *  fall back to on-chain-derived state. */
  lifecycleStage: "active" | "awaiting_dispute" | "disputed" | "completed" | null;
  /** Address that opened the current dispute, when lifecycleStage === "disputed". */
  disputerAddress: string | null;
  /** ms epoch when the dispute window closes; used for awaiting_dispute countdown. */
  disputeWindowEndsAt: number | null;
  /** Pre-generated Hawk/Dove briefing from Supabase, or null while the
   *  scheduled generator hasn't written one yet. */
  briefing: MarketBriefing | null;
};

/** Supabase events.id is a bare uuid; the on-chain contract stores the
 *  same id prefixed with `mkt_`. */
function marketIdFromEventId(eventId: string): string {
  return `mkt_${eventId}`;
}
function eventIdFromMarketId(marketId: string): string {
  return marketId.toLowerCase().startsWith("mkt_") ? marketId.slice(4) : marketId;
}

function clampThreshold(severity: number, override?: number | null): number {
  if (typeof override === "number" && override > 0) {
    return Math.min(100, Math.max(0, Math.round(override)));
  }
  // Default duel threshold is "the news has to escalate noticeably past
  // where it sits today". Bumps severity by ~5pts and clamps to a sane band.
  return Math.min(95, Math.max(50, Math.round(severity + 5)));
}

function buildQuestion(row: StoredEventRow | undefined, id: string): string {
  if (!row) return `Market ${id}`;
  const explicit = row.market_question?.trim();
  if (explicit) return explicit;
  const title = row.source_title?.trim() || row.narrative?.trim() || id;
  const t = clampThreshold(row.severity ?? 70, row.market_threshold);
  return `Will "${title}" escalate past severity ${t} within 48h?`;
}

const ZERO_ONCHAIN: OnchainMarket = {
  status: 0,
  winner: null,
  winnerCode: 0,
  hawkTotalWei: 0n,
  doveTotalWei: 0n,
  hawkTotalUsdc: 0,
  doveTotalUsdc: 0,
  resolved: false,
};

function parseTentativeWinner(v: unknown): AgentSide | null {
  if (typeof v !== "string") return null;
  const u = v.toUpperCase();
  return u === "HAWK" || u === "DOVE" ? (u as AgentSide) : null;
}

function buildMarketEntry(
  row: StoredEventRow,
  onchain: OnchainMarket,
  fullDetails: OnchainMarketFullDetails | null = null,
): Market {
  const id = marketIdFromEventId(row.id);
  const severity = row.severity ?? 70;
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  // Prefer authoritative on-chain resolutionTime; fall back to Supabase
  // `resolution_at`; final fallback is created_at + 48h for legacy rows.
  const resolutionAt = fullDetails?.resolutionTime
    ? fullDetails.resolutionTime
    : row.resolution_at
      ? new Date(row.resolution_at).getTime()
      : createdAt + 48 * 60 * 60 * 1000;
  const stakingEndTime = fullDetails?.stakingEndTime
    ? fullDetails.stakingEndTime
    : resolutionAt - STAKING_TO_RESOLUTION_BUFFER_MS;
  const aiTentativeWinner = parseTentativeWinner(row.ai_tentative_winner);
  const aiProcessed =
    !!row.ai_processed || fullDetails?.aiResolved === true;
  const marketFinalized =
    !!row.market_resolved || fullDetails?.finalized === true || onchain.resolved;
  const lsRaw = typeof row.lifecycle_stage === "string" ? row.lifecycle_stage.toLowerCase() : null;
  const lifecycleStage =
    lsRaw === "active" || lsRaw === "awaiting_dispute" || lsRaw === "disputed" || lsRaw === "completed"
      ? (lsRaw as Market["lifecycleStage"])
      : null;
  const disputeWindowEndsAt = row.dispute_window_ends_at
    ? new Date(row.dispute_window_ends_at).getTime()
    : null;
  return {
    id,
    eventId: row.id,
    question: buildQuestion(row, id),
    narrative: row.narrative ?? "On-chain market with no linked event metadata.",
    stage: normalizeEventStage(row.stage),
    severity,
    category: row.category ?? "unknown",
    threshold: clampThreshold(severity, row.market_threshold),
    sourceUrl: row.source_url ?? null,
    sourceTitle: row.source_title ?? null,
    unlinked: false,
    resolutionAt,
    stakingEndTime,
    createdAt,
    onchain,
    fullDetails,
    aiProcessed,
    aiTentativeWinner,
    aiReasoning: row.ai_reasoning?.trim() || null,
    marketFinalized,
    lifecycleStage,
    disputerAddress: row.disputer_address ?? null,
    disputeWindowEndsAt,
    briefing: buildBriefing(row),
  };
}

/**
 * Supabase-first market loader.
 *
 * 1. Query events where market_created = true — this is the authoritative
 *    list of live markets and renders instantly without any RPC hop.
 * 2. Emit those cards immediately with zeroed on-chain totals.
 * 3. Enrich in parallel via getMarket(marketId); on RPC failure we keep the
 *    zeroed defaults so a slow/rate-limited RPC never hides a market.
 */
export async function loadArenaMarkets(
  onProgress?: (partial: Market[]) => void,
): Promise<Market[]> {
  purgeArenaMarketCache();
  const provider = getArcReadProvider(ARC_TESTNET);
  const previousById = new Map((cachedMarkets ?? []).map((m) => [m.id, m]));

  // 1. Supabase-first: authoritative list of active markets.
  const { data, error } = await supabaseFeed
    .from("events")
    .select("*")
    .eq("market_created", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[loadArenaMarkets] supabase query failed", error);
    return [];
  }

  const rows = (data ?? []) as StoredEventRow[];
  if (rows.length === 0) return [];

  // 2. Build entries immediately using cached on-chain state where we have
  //    it, zeros otherwise, and emit so the UI renders now.
  const out: Market[] = rows.map((row) => {
    const id = marketIdFromEventId(row.id);
    const prev = previousById.get(id);
    return buildMarketEntry(row, prev?.onchain ?? ZERO_ONCHAIN, prev?.fullDetails ?? null);
  });
  if (onProgress) onProgress([...out]);

  const indexById = new Map<string, number>();
  out.forEach((m, i) => indexById.set(m.id, i));

  let lastEmit = 0;
  const emit = (force = false) => {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastEmit < 200) return;
    lastEmit = now;
    onProgress([...out]);
  };

  // 3. Enrich in Multicall3-batched chunks. Each chunk is 2 eth_calls
  //    (getMarket set + getMarketFullDetails set), streamed as it resolves so
  //    the first cards fill in without waiting for the whole set. Failures
  //    leave the seeded defaults in place so a slow RPC never hides markets.
  const CHUNK_SIZE = 25;
  const rowsById = new Map(rows.map((r) => [marketIdFromEventId(r.id), r]));
  const chunks: string[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + CHUNK_SIZE).map((r) => marketIdFromEventId(r.id)));
  }
  await Promise.all(
    chunks.map(async (ids) => {
      const [marketsMap, detailsMap] = await Promise.all([
        batchReadMarkets(ids, provider).catch((e) => {
          console.warn("[loadArenaMarkets] batchReadMarkets failed", e);
          return {} as Record<string, OnchainMarket>;
        }),
        batchReadMarketFullDetails(ids, provider).catch((e) => {
          console.warn("[loadArenaMarkets] batchReadMarketFullDetails failed", e);
          return {} as Record<string, OnchainMarketFullDetails | null>;
        }),
      ]);
      for (const id of ids) {
        const row = rowsById.get(id);
        const idx = indexById.get(id);
        if (!row || idx == null) continue;
        const onchain = marketsMap[id] ?? ZERO_ONCHAIN;
        const fullDetails = detailsMap[id] ?? null;
        out[idx] = buildMarketEntry(row, onchain, fullDetails);
      }
      emit();
    }),
  );
  emit(true);

  return out;
}

// Legacy helper name retained for callers that still import it.
export { eventIdFromMarketId };

/**
 * Authoritative agent win-rate, computed as a Supabase aggregate over every
 * fully finalized market.
 *
 * Only rows with `market_resolved = true` are counted — verified against the
 * live data, that flag is written exclusively by the finalizer after the
 * dispute window closes (AI-tentative rows sit at
 * `ai_processed = true, market_resolved = false`), so this never counts a
 * verdict that can still be disputed.
 *
 * Deliberately independent of wallet, claim state and RPC/multicall timing:
 * two `count`-only HEAD queries, identical for every visitor.
 */
export async function loadAgentTrackRecord(): Promise<{
  decided: number;
  HAWK: number | null;
  DOVE: number | null;
}> {
  const countFor = async (winner: AgentSide) => {
    const { count, error } = await supabaseFeed
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("market_created", true)
      .eq("market_resolved", true)
      .eq("ai_tentative_winner", winner);
    if (error) throw error;
    return count ?? 0;
  };
  try {
    const [hawk, dove] = await Promise.all([countFor("HAWK"), countFor("DOVE")]);
    const decided = hawk + dove;
    if (decided === 0) return { decided: 0, HAWK: null, DOVE: null };
    return {
      decided,
      HAWK: Math.round((hawk / decided) * 100),
      DOVE: Math.round((dove / decided) * 100),
    };
  } catch (e) {
    console.warn("[loadAgentTrackRecord] failed", e);
    return { decided: 0, HAWK: null, DOVE: null };
  }
}

/**
 * Module-level in-memory cache of the last successful market list, so
 * navigating away from /arena and back within the same session renders
 * instantly while a fresh fetch runs in the background. Cleared on full
 * page reload (intentional — we never want stale on-chain data after a
 * reload).
 */
let cachedMarkets: Market[] | null = null;

// Persistent market caches caused deleted / duplicate markets to re-render
// after the data source moved to Supabase-first. Keep this list aggressive so
// only current database rows can define the visible market list.
const LEGACY_LS_KEYS = ["arena:markets", "arena:markets:v1", "arena:markets:v2"];

function purgeArenaMarketCache(): void {
  cachedMarkets = null;
  if (typeof window === "undefined") return;
  try {
    for (const k of LEGACY_LS_KEYS) window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

function readLocalStorage(): Market[] | null {
  purgeArenaMarketCache();
  return null;
}

export function getCachedMarkets(): Market[] | null {
  if (cachedMarkets) return cachedMarkets;
  const fromLs = readLocalStorage();
  if (fromLs) cachedMarkets = fromLs;
  return cachedMarkets;
}

export function setCachedMarkets(list: Market[]): void {
  cachedMarkets = list;
}