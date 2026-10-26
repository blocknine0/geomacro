/**
 * Private, free-tier D1-first Telegram metadata for consented Bot channel posts.
 * This is NOT original news, licensed reuse, a risk index, an AI training feed,
 * a source verification, or a paid deliverable. No raw Telegram content stored.
 * Caller MUST be behind the existing CONTROL_PLANE_TOKEN authorization in index.mjs.
 */
export const TELEGRAM_FREE_LIVE_SCHEMA="geomacro.telegram-free-live-research.v1";
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const RETENTION_MS=25*3600*1000;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer"};
const response=(v,status=200)=>Response.json(v,{status,headers});
export async function readPrivateTelegramFreeLiveJson(env,query=new URLSearchParams(),now=Date.now()){
 const params=[...query.keys()],category=query.get("category"),country=query.get("country"),offset=query.get("offset")??"0";
 if(params.some(x=>!["category","country","offset"].includes(x))||
   ["category","country","offset"].some(x=>query.getAll(x).length>1)||
   (category!==null&&!CATEGORIES.has(category))||
   (country!==null&&!/^[A-Z]{3}$/u.test(country))||
   !["0","100","200"].includes(offset)||!Number.isFinite(now))
   return response({ok:false,error:"TELEGRAM_FREE_LIVE_QUERY_INVALID"},400);
 try{
   const cutoff=new Date(now-RETENTION_MS).toISOString(),at=new Date(now).toISOString();
   let where=" WHERE published_at>=? AND expires_at>?",args=[cutoff,at];
   if(category){where+=" AND category=?";args.push(category)}
   if(country){where+=" AND country_iso3=?";args.push(country)}
   const result=await env.DB.prepare(
     "SELECT delivery_id,category,country_iso3,topic_code,published_at,observed_at "+
     "FROM telegram_authorized_live_research"+where+
     " ORDER BY published_at DESC,delivery_id DESC LIMIT 101 OFFSET ?")
      .bind(...args,Number(offset)).all();
   const rows=result?.results??[];
   const items=rows.slice(0,100).map(row=>({
     schema:TELEGRAM_FREE_LIVE_SCHEMA,
     reference_id:row.delivery_id,
     category:row.category,country_iso3:row.country_iso3,
     broad_topic:row.topic_code,
     source_timestamp_claimed_at:row.published_at,
     received_at:row.observed_at,
     source_native_clock_independently_verified:false,
     source_scope:"INDIVIDUALLY_CONSENTED_BOT_POST_HASH_ONLY",
     verification_status:"UNVERIFIED",
     unverified_research_lead:true,
     factual_news_item:false,
     independent_official_original_verified:false,
     public_customer_delivery_authorized:false,
     ai_deployment_or_training_authorized_by_this_endpoint:false,
     source_content_included:false,
     publisher_handle_included:false,
     commercial_reuse_authorized:false,chargeable:false,scored:false,
   }));
   return response({ok:true,schema:TELEGRAM_FREE_LIVE_SCHEMA,
     privacy:"CONTROL_PLANE_AUTH_REQUIRED_NO_RAW_CONTENT",
     rights:"PER_SOURCE_CONSENT_REQUIRED_UNVERIFIED_RESEARCH_ONLY",
     free_tier_storage:"D1_NO_B2_PER_POST",
     retained_hours:25,public_news_promotion_authorized:false,
     signed_risk_object_authorized:false,payment_required_now:false,
     all_195_countries_live_verified:false,all_three_categories_live_verified:false,
     category_filter:category,country_filter:country,offset:Number(offset),
     page_size:100,has_more:rows.length>100,
     next_offset:rows.length>100&&Number(offset)<200?Number(offset)+100:null,items});
 }catch{
   return response({ok:false,error:"TELEGRAM_FREE_LIVE_D1_UNAVAILABLE",
     items:[],paid_delivery_enabled:false},503);
 }
}
