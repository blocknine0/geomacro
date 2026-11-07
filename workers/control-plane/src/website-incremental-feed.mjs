/**
 * P2 #12: direct current canonical D1/60s edge category feed for the free
 * Website Intelligence journal. The existing public 72h research journal
 * remains UNVERIFIED and separate from independently signed GRO delivery.
 * No ISR rebuild or global Cloudflare purge token is necessary: bounded
 * per-category POP TTL provides deterministic <=60s cache invalidation.
 */
import {verifyDerivedStory} from "./website-derived-intelligence.mjs";
export const P2_FEED_SCHEMA="geomacro.canonical-category-edge-feed.v1";
const CATS=new Set(["geopolitics","macro","rare_earth"]);
export async function readIncrementalWebsiteCategoryFeed(env,category,now=Date.now()){
 if(!env?.DB?.prepare||!Number.isFinite(now)||!CATS.has(category))
  return Response.json({ok:false,error:"CANONICAL_EDGE_FEED_INVALID"}, {status:400});
 try{
  const from=new Date(now-72*3600_000).toISOString();
  const response=await env.DB.prepare(
   "SELECT id,category,published_at,date_precision,story_json,first_seen_at "+
   "FROM website_derived_intelligence WHERE category=? "+
   "AND published_at>=? AND first_seen_at>=? AND first_seen_at<=? "+
   "ORDER BY published_at DESC,id DESC LIMIT 81"
  ).bind(category,from.slice(0,10),from,new Date(now).toISOString()).all();
  if(!Array.isArray(response?.results)||response.results.length>81)
   throw Error("CANONICAL_FEED_READ_UNVERIFIED");
  const signals=[];
  for(const row of response.results.slice(0,80)){
   let story;try{story=JSON.parse(row.story_json)}catch{throw Error();}
   if(story.id!==row.id||story.category!==category||
      story.published_at!==row.published_at||
      story.date_precision!==row.date_precision||
      !verifyDerivedStory(story,now))throw Error();
   if(Date.parse(row.published_at)<now-72*3600_000)continue;
   signals.push(story);
  }
  return Response.json({
   ok:true,schema:P2_FEED_SCHEMA,
   category,checked_at:new Date(now).toISOString(),
   source:"CANONICAL_WEBSITE_D1_JOURNAL",
   original_publisher_text_redistributed:false,
   source_clock_is_native_publication:true,
   origin_readback:"D1_CANONICAL",
   journal_retention_hours:72,
   gro_verified_publication:false,
   independent_event_verified:false,
   scored:false,chargeable:false,
   rows_returned:signals.length,has_more:response.results.length>80,
   signals
  },{headers:{
   "Cache-Control":"public, max-age=60",
   "X-GeoMacro-Data-Origin":"canonical-d1",
   "X-GeoMacro-Original-Clock":"source-native",
   "X-Content-Type-Options":"nosniff",
   "Access-Control-Allow-Origin":"*",
   "Access-Control-Expose-Headers":"X-GeoMacro-Data-Origin, X-GeoMacro-Original-Clock",
   "Vary":"Accept-Encoding",
  }});
 }catch{
  return Response.json({
   ok:false,error:"CANONICAL_WEBSITE_EDGE_FEED_UNAVAILABLE",
   canonical_read_failed:true,signals:[],
  },{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
