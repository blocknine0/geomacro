import type { FeedEvent } from "./live-feed.functions";

/**
 * Strip internal identifiers (`id`) from feed events before they leave the
 * server boundary. Internal ids leak narrative/source hints (e.g.
 * `evt_geo_iran_israel_proxy_001`) and must never reach the client UI or
 * be serialised in API responses.
 */
export function stripInternalIds<T extends Record<string, unknown>>(
  events: T[],
): Array<Omit<T, "id">> {
  return events.map((e) => {
    const clone = { ...e };
    delete (clone as Record<string, unknown>).id;
    return clone as Omit<T, "id">;
  });
}

export type PublicFeedEvent = Omit<FeedEvent, "id">;