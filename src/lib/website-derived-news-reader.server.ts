import {checkedDerivedNews,fetchAllDerivedNews} from "./public-derived-news-client";
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


const CACHE_MS=60_000;
let sharedCache:{expiresAt:number;value:WebsiteDerivedNewsResult}|null=null;
let sharedFlight:Promise<WebsiteDerivedNewsResult>|null=null;

/** Exact shared embargo/privacy checks; no provider, B2, Supabase or paid call. */
export async function readWebsiteDerivedNews(fetchImpl:typeof fetch=fetch,now=Date.now()):Promise<WebsiteDerivedNewsResult>{
    if(!Number.isFinite(now))throw Error("DERIVED_NEWS_FEED_CLOCK_INVALID");
    const cacheable=fetchImpl===fetch;
    if(cacheable&&sharedCache&&now<sharedCache.expiresAt)
      return structuredClone(sharedCache.value);
    if(cacheable&&sharedFlight)return structuredClone(await sharedFlight);
    const work=(async()=>{
      // The bundle and journal views share the Worker's public edge cache and
      // retain all three categories, including explicitly unverified OSINT.
      const signals=await fetchAllDerivedNews(fetchImpl,now,{fresh:false});
      const data:WebsiteDerivedNewsResult={ok:true,
        schema:"geomacro.website-derived-news-feed.v1",
        checked_at:new Date(now).toISOString(),original_release_delay_minutes:0,
        retention_days:3,retention_hours:72,delivery_scope:"free_website_only",signals};
      data.signals=checkedDerivedNews(data,now);
      if(cacheable)sharedCache={expiresAt:now+CACHE_MS,value:structuredClone(data)};
      return data;
    })();
    if(cacheable)sharedFlight=work;
    try{return await work}
    finally{if(cacheable&&sharedFlight===work)sharedFlight=null}
}
