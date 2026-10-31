import { checkedDerivedNews, fetchDirectDerivedNews, GEOMACRO_DERIVED_JOURNAL_URL } from "./public-derived-news-client";
import { fetchWithoutRedirectUsing } from "./fetch-without-redirect";
import type { StatelessIntelligenceSignal } from "./stateless-intelligence-model";

/** Homepage-specific, bounded failover. The archive is the primary public read.
 * If no currently eligible stories exist, check the pinned public D1-derived
 * journal; never substitute raw articles, stale scores or fabricated cards.
 * This avoids adding D1 traffic to the other consumers of the archive reader.
 */
export async function fetchHomeDerivedNews(
  fetchImpl: typeof fetch = fetch, now = Date.now(),
): Promise<StatelessIntelligenceSignal[]> {
  let hadValidEmptyRead = false;
  try {
    const archive = await fetchDirectDerivedNews(fetchImpl, now);
    if (archive.length > 0) return archive;
    hadValidEmptyRead = true;
  } catch {
    // A stale/unavailable public snapshot may recover through the same
    // governed derived-only publisher endpoint. No private API is called.
  }

  try {
    const response = await fetchWithoutRedirectUsing(fetchImpl, GEOMACRO_DERIVED_JOURNAL_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 512_000) {
      throw new Error("HOME_FINDS_JOURNAL_UNAVAILABLE");
    }
    const raw = await response.text();
    if (raw.length > 512_000) throw new Error("HOME_FINDS_JOURNAL_TOO_LARGE");
    return checkedDerivedNews(JSON.parse(raw), now);
  } catch {
    if (hadValidEmptyRead) return [];
    throw new Error("HOME_FINDS_PUBLIC_READS_UNAVAILABLE");
  }
}
