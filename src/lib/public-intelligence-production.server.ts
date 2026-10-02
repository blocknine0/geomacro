import { createHash } from "node:crypto";
import { readB2PublicIntelligence } from "./b2-live.server";
import type { PublicIntelligenceRow } from "./public-intelligence.functions";

export type ProductionPublicIntelligenceRow = PublicIntelligenceRow & {
  public_status: "verified_b2" | "live_observed";
};

export type ProductionPublicIntelligence = {
  rows: ProductionPublicIntelligenceRow[];
  mode: "verified_b2" | "verified_b2_plus_live_observed" | "live_observed_only";
  verified_rows: number;
  live_observed_rows: number;
  newest_at: string | null;
  current_within_24h: boolean;
  generated_at: string;
};

const LIVE_OVERLAY_TTL_MS = 10 * 60 * 1000;
const LIVE_OVERLAY_TRIGGER_AGE_MS = 2 * 60 * 60 * 1000;
const LIVE_MAX_AGE_MS = 30 * 60 * 60 * 1000;
const MAX_ROWS_PER_CATEGORY = 6;
const MAX_TOTAL_ROWS = 300;
const GDELT_TIMEOUT_MS = 7_000;
const OPEN_SOURCE_TIMEOUT_MS = 6_000;
const RELIEFWEB_APPNAME = "geomacro.live";

const GDELT_QUERIES = [
  {
    category: "geopolitics",
    query: "(conflict OR sanctions OR diplomacy)",
  },
  {
    category: "macro",
    query: "(inflation OR \"central bank\" OR tariffs)",
  },
  {
    category: "rare_earth",
    query: "(\"rare earth\" OR \"critical minerals\" OR lithium)",
  },
] as const;

let overlayCache: { expiresAt: number; rows: ProductionPublicIntelligenceRow[] } | null = null;

function rowTime(row: Pick<PublicIntelligenceRow, "published_at" | "created_at">): number {
  const published = Date.parse(String(row.published_at ?? ""));
  if (Number.isFinite(published)) return published;
  const created = Date.parse(String(row.created_at ?? ""));
  return Number.isFinite(created) ? created : -Infinity;
}

function newestAt(rows: Array<Pick<PublicIntelligenceRow, "published_at" | "created_at">>): string | null {
  const latest = rows.reduce((best, row) => Math.max(best, rowTime(row)), -Infinity);
  return Number.isFinite(latest) ? new Date(latest).toISOString() : null;
}

function cleanTitle(value: unknown): string | null {
  const title = String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length < 18 || title.length > 260) return null;
  return title;
}

function liveDate(value: unknown): string | null {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed)) return null;
  const now = Date.now();
  if (parsed > now + 5 * 60_000 || now - parsed > LIVE_MAX_AGE_MS) return null;
  return new Date(parsed).toISOString();
}

function gdeltDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  const normalized = compact
    ? `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`
    : raw;
  return liveDate(normalized);
}

function stableLiveId(category: string, title: string, publishedAt: string): string {
  return `live_${category}_${createHash("sha256")
    .update(`${category}\0${title}\0${publishedAt}`)
    .digest("hex")
    .slice(0, 28)}`;
}

function liveRow(
  category: "geopolitics" | "macro" | "rare_earth",
  title: string,
  publishedAt: string,
  sourceLabel?: string,
): ProductionPublicIntelligenceRow {
  const sourceTitle = sourceLabel ? `${sourceLabel} · ${title}` : title;
  return {
    id: stableLiveId(category, sourceTitle, publishedAt),
    source_title: sourceTitle,
    summary: title,
    category,
    severity: null,
    delta: null,
    created_at: new Date().toISOString(),
    published_at: publishedAt,
    public_status: "live_observed",
  };
}

async function fetchGdeltCategory(
  category: (typeof GDELT_QUERIES)[number]["category"],
  query: string,
): Promise<ProductionPublicIntelligenceRow[]> {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "10");
  url.searchParams.set("sort", "DateDesc");
  url.searchParams.set("timespan", "1d");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(GDELT_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GDELT_${response.status}`);

  const payload = (await response.json()) as { articles?: Array<Record<string, unknown>> };
  const rows: ProductionPublicIntelligenceRow[] = [];
  const seen = new Set<string>();

  for (const article of payload.articles ?? []) {
    const title = cleanTitle(article.title);
    const publishedAt = gdeltDate(article.seendate ?? article.seenDate ?? article.published_at);
    if (!title || !publishedAt) continue;
    const normalizedTitle = title.toLowerCase();
    if (seen.has(normalizedTitle)) continue;
    seen.add(normalizedTitle);
    rows.push(liveRow(category, title, publishedAt));
    if (rows.length >= MAX_ROWS_PER_CATEGORY) break;
  }

  return rows;
}

/**
 * USGS is an official, keyless near-real-time feed already admitted by the
 * Geomacro open source mesh. Natural-hazard observations are mapped to the
 * macro domain there because they can create immediate economic disruption.
 * These rows remain observations only and never receive synthetic scores.
 */
async function fetchUsgsMacro(): Promise<ProductionPublicIntelligenceRow[]> {
  const response = await fetch(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
    {
      headers: { Accept: "application/geo+json, application/json" },
      signal: AbortSignal.timeout(OPEN_SOURCE_TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`USGS_${response.status}`);

  const payload = (await response.json()) as {
    features?: Array<{
      properties?: Record<string, unknown>;
    }>;
  };
  const rows: ProductionPublicIntelligenceRow[] = [];
  const seen = new Set<string>();

  for (const feature of payload.features ?? []) {
    const properties = feature?.properties ?? {};
    const title = cleanTitle(properties.title);
    const publishedAt = liveDate(properties.updated ?? properties.time);
    if (!title || !publishedAt) continue;
    const normalizedTitle = title.toLowerCase();
    if (seen.has(normalizedTitle)) continue;
    seen.add(normalizedTitle);
    rows.push(liveRow("macro", title, publishedAt, "USGS"));
    if (rows.length >= MAX_ROWS_PER_CATEGORY) break;
  }

  return rows;
}

/**
 * ReliefWeb is a UN OCHA public metadata API. The appname parameter identifies
 * the caller; it is not a credential. Latest report metadata gives a second
 * independent geopolitical continuity source when GDELT is slow or unavailable.
 */
async function fetchReliefWebGeopolitics(): Promise<ProductionPublicIntelligenceRow[]> {
  const url = new URL("https://api.reliefweb.int/v2/reports");
  url.searchParams.set("appname", RELIEFWEB_APPNAME);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      preset: "latest",
      profile: "list",
      limit: 12,
      fields: {
        include: ["title", "date.original", "date.created"],
      },
    }),
    signal: AbortSignal.timeout(OPEN_SOURCE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`RELIEFWEB_${response.status}`);

  const payload = (await response.json()) as {
    data?: Array<{
      fields?: {
        title?: unknown;
        date?: { original?: unknown; created?: unknown };
      };
    }>;
  };
  const rows: ProductionPublicIntelligenceRow[] = [];
  const seen = new Set<string>();

  for (const item of payload.data ?? []) {
    const title = cleanTitle(item?.fields?.title);
    const publishedAt = liveDate(item?.fields?.date?.original ?? item?.fields?.date?.created);
    if (!title || !publishedAt) continue;
    const normalizedTitle = title.toLowerCase();
    if (seen.has(normalizedTitle)) continue;
    seen.add(normalizedTitle);
    rows.push(liveRow("geopolitics", title, publishedAt, "UN OCHA ReliefWeb"));
    if (rows.length >= MAX_ROWS_PER_CATEGORY) break;
  }

  return rows;
}

async function liveOverlay(): Promise<ProductionPublicIntelligenceRow[]> {
  if (overlayCache && overlayCache.expiresAt > Date.now()) return overlayCache.rows;

  const settled = await Promise.allSettled([
    ...GDELT_QUERIES.map(({ category, query }) => fetchGdeltCategory(category, query)),
    fetchUsgsMacro(),
    fetchReliefWebGeopolitics(),
  ]);
  const rows = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  overlayCache = { expiresAt: Date.now() + LIVE_OVERLAY_TTL_MS, rows };
  return rows;
}

function mergeRows(
  verified: ProductionPublicIntelligenceRow[],
  observed: ProductionPublicIntelligenceRow[],
): ProductionPublicIntelligenceRow[] {
  const dedupe = new Map<string, ProductionPublicIntelligenceRow>();
  for (const row of [...observed, ...verified].sort((a, b) => rowTime(b) - rowTime(a))) {
    const title = String(row.source_title ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const key = `${String(row.category ?? "").toLowerCase()}|${title}`;
    if (!title || dedupe.has(key)) continue;
    dedupe.set(key, row);
    if (dedupe.size >= MAX_TOTAL_ROWS) break;
  }
  return [...dedupe.values()];
}

export async function readProductionPublicIntelligence(): Promise<ProductionPublicIntelligence> {
  const generatedAt = new Date().toISOString();
  const base = (await readB2PublicIntelligence()) ?? [];
  const verified = base.map((row) => ({ ...row, public_status: "verified_b2" as const }));
  const verifiedNewest = newestAt(verified);
  const verifiedNewestMs = verifiedNewest ? Date.parse(verifiedNewest) : -Infinity;
  const needsLiveOverlay =
    !Number.isFinite(verifiedNewestMs) || Date.now() - verifiedNewestMs > LIVE_OVERLAY_TRIGGER_AGE_MS;

  let observed: ProductionPublicIntelligenceRow[] = [];
  if (needsLiveOverlay) {
    try {
      observed = await liveOverlay();
    } catch (error) {
      console.error(
        "[public-intelligence] live discovery overlay unavailable",
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }

  const rows = mergeRows(verified, observed);
  const newest = newestAt(rows);
  const newestMs = newest ? Date.parse(newest) : -Infinity;
  const currentWithin24h = Number.isFinite(newestMs) && Date.now() - newestMs <= 24 * 60 * 60 * 1000;

  return {
    rows,
    mode:
      verified.length > 0 && observed.length > 0
        ? "verified_b2_plus_live_observed"
        : verified.length > 0
          ? "verified_b2"
          : "live_observed_only",
    verified_rows: verified.length,
    live_observed_rows: observed.length,
    newest_at: newest,
    current_within_24h: currentWithin24h,
    generated_at: generatedAt,
  };
}
