import { ARC_TESTNET, getArcReadProvider } from "./arc";
import {
  batchReadMarkets,
  batchReadMarketFullDetails,
  STAKING_TO_RESOLUTION_BUFFER_MS,
  OLD_CONTRACT_ADDRESS,
  type OnchainMarket,
  type OnchainMarketFullDetails,
} from "./agent-arena";
import { normalizeEventStage } from "./event-stage";
import type { AgentSide } from "./agents";
import type { StoredEventRow } from "./supabase-feed";
import type { Market, MarketBriefing } from "./arena-markets";

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

function marketIdFromEventId(eventId: string): string {
  return `mkt_${eventId}`;
}

function clampThreshold(severity: number, override?: number | null): number {
  if (typeof override === "number" && override > 0) {
    return Math.min(100, Math.max(0, Math.round(override)));
  }
  return Math.min(95, Math.max(50, Math.round(severity + 5)));
}

function buildQuestion(row: StoredEventRow, id: string): string {
  const explicit = row.market_question?.trim();
  if (explicit) return explicit;
  const title = row.source_title?.trim() || row.narrative?.trim() || id;
  const threshold = clampThreshold(row.severity ?? 70, row.market_threshold);
  return `Will "${title}" escalate past severity ${threshold} within 48h?`;
}

function parseTentativeWinner(value: unknown): AgentSide | null {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase();
  return normalized === "HAWK" || normalized === "DOVE"
    ? (normalized as AgentSide)
    : null;
}

function buildBriefing(row: StoredEventRow): MarketBriefing | null {
  const hawk = row.hawk_reasoning?.trim();
  const dove = row.dove_reasoning?.trim();
  if (!hawk || !dove) return null;

  const clampConfidence = (value: number | null | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.min(100, Math.round(value)))
      : fallback;

  return {
    hawk: {
      side: "YES",
      confidence: clampConfidence(row.hawk_conviction, 50),
      stakeUsdc: 0,
      rationale: hawk,
    },
    dove: {
      side: "NO",
      confidence: clampConfidence(row.dove_conviction, 50),
      stakeUsdc: 0,
      rationale: dove,
    },
    generatedAt: row.briefing_generated_at ?? null,
  };
}

function buildMarketEntry(
  row: StoredEventRow,
  onchain: OnchainMarket,
  fullDetails: OnchainMarketFullDetails | null,
): Market {
  const id = marketIdFromEventId(row.id);
  const severity = row.severity ?? 70;
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  const resolutionAt = fullDetails?.resolutionTime
    ? fullDetails.resolutionTime
    : row.resolution_at
      ? new Date(row.resolution_at).getTime()
      : createdAt + 48 * 60 * 60 * 1000;
  const stakingEndTime = fullDetails?.stakingEndTime
    ? fullDetails.stakingEndTime
    : resolutionAt - STAKING_TO_RESOLUTION_BUFFER_MS;
  const aiTentativeWinner = parseTentativeWinner(row.ai_tentative_winner);
  const aiProcessed = Boolean(row.ai_processed) || fullDetails?.aiResolved === true;
  const marketFinalized =
    Boolean(row.market_resolved) || fullDetails?.finalized === true || onchain.resolved;
  const lifecycleRaw =
    typeof row.lifecycle_stage === "string" ? row.lifecycle_stage.toLowerCase() : null;
  const lifecycleStage =
    lifecycleRaw === "active" ||
    lifecycleRaw === "awaiting_dispute" ||
    lifecycleRaw === "disputed" ||
    lifecycleRaw === "completed"
      ? (lifecycleRaw as Market["lifecycleStage"])
      : null;

  return {
    id,
    marketAddress: row.market_address || OLD_CONTRACT_ADDRESS,
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
    disputeWindowEndsAt: row.dispute_window_ends_at
      ? new Date(row.dispute_window_ends_at).getTime()
      : null,
    briefing: buildBriefing(row),
  };
}

/**
 * Enrich canonical server-fetched market rows with public Arc contract state.
 * Supabase credentials never enter this client path.
 */
export async function loadArenaMarketsFromRows(
  rows: StoredEventRow[],
  onProgress?: (partial: Market[]) => void,
): Promise<Market[]> {
  if (rows.length === 0) return [];

  const provider = getArcReadProvider(ARC_TESTNET);
  const out = rows.map((row) => buildMarketEntry(row, ZERO_ONCHAIN, null));
  onProgress?.([...out]);

  const indexById = new Map<string, number>();
  out.forEach((market, index) => indexById.set(market.id, index));
  const rowsById = new Map(rows.map((row) => [marketIdFromEventId(row.id), row]));
  const chunks: string[][] = [];
  const chunkSize = 25;

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(
      rows
        .slice(index, index + chunkSize)
        .map((row) => marketIdFromEventId(row.id)),
    );
  }

  let lastEmit = 0;
  const emit = (force = false) => {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastEmit < 200) return;
    lastEmit = now;
    onProgress([...out]);
  };

  await Promise.all(
    chunks.map(async (ids) => {
      const addressFor = (marketId: string) =>
        rowsById.get(marketId)?.market_address || OLD_CONTRACT_ADDRESS;

      const [marketsMap, detailsMap] = await Promise.all([
        batchReadMarkets(ids, provider, addressFor).catch((error) => {
          console.warn("[arena] batch market read failed", error);
          return {} as Record<string, OnchainMarket>;
        }),
        batchReadMarketFullDetails(ids, provider, addressFor).catch((error) => {
          console.warn("[arena] batch market detail read failed", error);
          return {} as Record<string, OnchainMarketFullDetails | null>;
        }),
      ]);

      for (const id of ids) {
        const row = rowsById.get(id);
        const index = indexById.get(id);
        if (!row || index === undefined) continue;
        out[index] = buildMarketEntry(
          row,
          marketsMap[id] ?? ZERO_ONCHAIN,
          detailsMap[id] ?? null,
        );
      }
      emit();
    }),
  );

  emit(true);
  return out;
}
