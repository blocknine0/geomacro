import {checkedDerivedNews,fetchAllDerivedNews,fetchRiskStreamPublicTeasers} from "./public-derived-news-client";
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

/** Merge the derived journal and score-free signed-GRO teaser projection. The
 * client validates both feeds and keeps the existing privacy and age checks. */
export async function readWebsiteDerivedNews(fetchImpl:typeof fetch=fetch,now=Date.now()):Promise<WebsiteDerivedNewsResult>{
    if(!Number.isFinite(now))throw Error("DERIVED_NEWS_FEED_CLOCK_INVALID");
    const cacheable=fetchImpl===fetch;
    if(cacheable&&sharedCache&&now<sharedCache.expiresAt)
      return structuredClone(sharedCache.value);
    if(cacheable&&sharedFlight)return structuredClone(await sharedFlight);
    const work=(async()=>{
      // Keep the established derived-news read unchanged. The extra teaser
      // read is best-effort and only runs for the default live reader, so
      // injected journal readers retain their one-request contract.
      const [journal,teasers]=await Promise.all([
        fetchAllDerivedNews(fetchImpl,now,{fresh:true}),
        fetchImpl===fetch?fetchRiskStreamPublicTeasers(fetchImpl,now):Promise.resolve([]),
      ]);
      const merged=new Map<string,StatelessIntelligenceSignal>();
      for(const signal of journal)merged.set(signal.id,signal);
      for(const signal of teasers)merged.set(signal.id,signal);
      const signals=[...merged.values()].sort((a,b)=>
        b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
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
