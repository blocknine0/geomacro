import type { FeedEvent } from "./live-feed.functions";

/**
 * Strip internal identifiers (`id`, `hitIndex`) from feed events before they
 * leave the server boundary. Internal ids leak narrative/source hints (e.g.
 * `evt_geo_iran_israel_proxy_001`) and `hitIndex` is only used server-side to
 * validate that narrative/summary are grounded in the same news hit — neither
 * should reach the client UI or be serialised in API responses.
 */
export function stripInternalIds<T extends Record<string, unknown>>(
  events: T[],
): Array<Omit<T, "id" | "hitIndex">> {
  return events.map((e) => {
    const clone = { ...e };
    delete (clone as Record<string, unknown>).id;
    delete (clone as Record<string, unknown>).hitIndex;
    return clone as Omit<T, "id" | "hitIndex">;
  });
}

export type PublicFeedEvent = Omit<FeedEvent, "id" | "hitIndex">;
