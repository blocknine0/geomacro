import {fetchWithoutRedirectUsing} from "./fetch-without-redirect";
import {checkedDerivedNews} from "./public-derived-news-client";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";

export type WebsiteDerivedNewsResult = {
  ok: true;
  schema: "geomacro.website-derived-news-feed.v1";
  checked_at: string;
  original_release_delay_minutes: 0;
  retention_days: 3;
  retention_hours: 72;
  delivery_scope: "free_website_only";
  signals: StatelessIntelligenceSignal[];
};


const JOURNAL = "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-immediate";

/** Exact shared embargo/privacy checks; no provider, B2, Supabase or paid call. */
export async function readWebsiteDerivedNews(fetchImpl:typeof fetch=fetch,now=Date.now()):Promise<WebsiteDerivedNewsResult>{
    const response = await fetchWithoutRedirectUsing(fetchImpl,JOURNAL, {
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
        (data.original_release_delay_minutes!==0&&data.original_release_delay_minutes!==15) ||
        data.retention_days !== 3 || data.retention_hours !== 72 ||
        data.delivery_scope !== "free_website_only" ||
        !Array.isArray(data.signals) || data.signals.length > 250) {
      throw Error("DERIVED_NEWS_FEED_SCHEMA_INVALID");
    }
    // Shared browser/server embargo, exact shape and privacy validation.
    data.signals = checkedDerivedNews(data,now);
    return data;
}
