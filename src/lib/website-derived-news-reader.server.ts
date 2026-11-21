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

/** The shared client validator still accepts the earlier GRO teaser envelope.
 * Adapt only its in-memory validation input, then restore the strict public
 * SIGNAL_KEYS shape before applying checkedDerivedNews to the merged feed. */
async function fetchCheckedRiskStreamTeasers(fetchImpl:typeof fetch,now:number){
  const compatibilityFetch:typeof fetch=async(input,init)=>{
    const response=await fetchImpl(input,init);
    if(!response.ok)return response;
    try{
      const body=await response.clone().json() as Record<string,unknown>;
      if(!Array.isArray(body.signals))return response;
      const signals=body.signals.map((value)=>{
        if(!value||typeof value!=="object"||Array.isArray(value))return value;
        const signal=value as Record<string,unknown>;
        const id=typeof signal.id==="string"?
          /^(?:geopolitics|macro|rare_earth)-([0-9a-f]{8})$/u.exec(signal.id):null;
        return id?{...signal,id:id[1].repeat(8),country_iso3:signal.geography}:value;
      });
      return new Response(JSON.stringify({...body,signals}),{
        status:response.status,statusText:response.statusText,headers:response.headers,
      });
    }catch{return response}
  };
  const compatible=await fetchRiskStreamPublicTeasers(compatibilityFetch,now);
  const strict=[] as StatelessIntelligenceSignal[];
  for(const value of compatible){
    const legacy=value as StatelessIntelligenceSignal&{country_iso3?:string};
    const match=/^[0-9a-f]{8}/u.exec(legacy.id);
    if(!match)continue;
    const {country_iso3:_countryIso3,...signal}=legacy;
    strict.push({...signal,id:`${signal.category}-${match[0]}`});
  }
  return strict;
}

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
        fetchImpl===fetch?fetchCheckedRiskStreamTeasers(fetchImpl,now):Promise.resolve([]),
      ]);
      // Validate teasers in isolation before merging. A malformed optional
      // projection must never make the established journal fail validation.
      const checkedTeasers=checkedDerivedNews({ok:true,
        schema:"geomacro.website-derived-news-feed.v1",
        checked_at:new Date(now).toISOString(),original_release_delay_minutes:0,
        retention_days:3,retention_hours:72,delivery_scope:"free_website_only",
        signals:teasers},now);
      const merged=new Map<string,StatelessIntelligenceSignal>();
      for(const signal of journal)merged.set(signal.id,signal);
      for(const signal of checkedTeasers)merged.set(signal.id,signal);
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
