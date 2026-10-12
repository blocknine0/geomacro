import { createServerFn } from "@tanstack/react-start";
import type { StatelessIntelligenceSignal } from "./stateless-intelligence-model";

export type WebsiteDerivedNewsResult = {
  ok: true;
  schema: "geomacro.website-derived-news-feed.v1";
  checked_at: string;
  original_release_delay_minutes: 15;
  retention_days: 30;
  delivery_scope: "free_website_only";
  signals: StatelessIntelligenceSignal[];
};

const JOURNAL = "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news";

/** Read a recent, derived-only 30d D1 timeline; fail closed to live-only cards. */
export const getWebsiteDerivedNews = createServerFn({ method: "GET" })
  .handler(async (): Promise<WebsiteDerivedNewsResult> => {
    const { setResponseHeaders } = await import("@tanstack/react-start/server");
    setResponseHeaders(new Headers({ "Cache-Control": "no-store", "CDN-Cache-Control": "no-store" }));
    const response = await fetch(JOURNAL, {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4_500),
    });
    if (!response.ok) throw Error("DERIVED_NEWS_FEED_UNAVAILABLE");
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > 512_000) throw Error("DERIVED_NEWS_FEED_TOO_LARGE");
    const raw = await response.text();
    if (raw.length > 512_000) throw Error("DERIVED_NEWS_FEED_TOO_LARGE");
    const data = JSON.parse(raw) as WebsiteDerivedNewsResult;
    if (data.ok !== true ||
        data.schema !== "geomacro.website-derived-news-feed.v1" ||
        data.original_release_delay_minutes !== 15 ||
        data.retention_days !== 30 ||
        data.delivery_scope !== "free_website_only" ||
        !Array.isArray(data.signals) || data.signals.length > 250) {
      throw Error("DERIVED_NEWS_FEED_SCHEMA_INVALID");
    }
    const now = Date.now();
    data.signals = data.signals.filter(s => {
      const date = Date.parse(s.published_at);
      const eligible = s.date_precision === "day"
        ? /^\d{4}-\d{2}-\d{2}$/u.test(s.published_at) && ["rare_earth","geopolitics"].includes(s.category) &&
          date + 36 * 60 * 60_000 + 15 * 60_000 <= now
        : date + 15 * 60_000 <= now;
      return Number.isFinite(date) && date >= now - 30 * 86_400_000 &&
        eligible &&
        ["geopolitics","macro","rare_earth"].includes(s.category) &&
        s.status === "official_release_observed_unscored" &&
        s.same_event_corrob_verified === false &&
        s.severity === null &&
        typeof s.id === "string" &&
        /^Geomacro finds /u.test(s.title) &&
        !/https?:\/\//iu.test(JSON.stringify(s));
    });
    return data;
  });
