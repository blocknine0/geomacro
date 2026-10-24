/** Private, source-neutral Telegram lead research JSON.
 * Read only after strong existing control plane credential; no public route.
 * Does NOT assert a Geomacro news item, current original, usage rights, LLM
 * permission, verified signature or chargeable risk product.
 */
export const PRIVATE_TELEGRAM_JSON_SCHEMA="geomacro.telegram-research-json.v1";
const CATEGORIES=["geopolitics","macro","rare_earth"];
export const TELEGRAM_AUTHORIZED_RESEARCH_RETENTION_HOURS=25;
const HOUR25=TELEGRAM_AUTHORIZED_RESEARCH_RETENTION_HOURS*3600*1000;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer"};
function json(payload,status=200){return Response.json(payload,{status,headers})}
export async function readPrivateTelegramResearchJson(env,query=new URLSearchParams(),now=Date.now()){
 const names=[...query.keys()],category=query.get("category"),country=query.get("country"),offset=query.get("offset")??"0";
 if(names.some(n=>!["country","category","offset"].includes(n))||
   ["category","country","offset"].some(n=>query.getAll(n).length>1)||
   (category!==null&&!CATEGORIES.includes(category))||
   (country!==null&&!/^[A-Z]{3}$/u.test(country))||
   !["0","100","200"].includes(offset))
  return json({ok:false,error:"TELEGRAM_RESEARCH_QUERY_INVALID"},400);
 const cutoff=new Date(now-HOUR25).toISOString();
 try{
   let where=" WHERE published_at >= ?",args=[cutoff];
   if(category){where+=" AND category = ?";args.push(category)}
   if(country){where+=" AND country_iso3 = ?";args.push(country)}
   const result=await env.DB.prepare("SELECT delivery_id,category,country_iso3,published_at "+
     "FROM telegram_research_json"+where+
     " ORDER BY published_at DESC,delivery_id DESC LIMIT 101 OFFSET ?")
     .bind(...args,Number(offset)).all();
   const rows=result?.results??[];
   const items=rows.slice(0,100).map(r=>({
     schema:PRIVATE_TELEGRAM_JSON_SCHEMA,
     reference_id:r.delivery_id,
     category:r.category,country_iso3:r.country_iso3,
     source_timestamp_claimed_at:r.published_at,
     source_native_clock_independently_verified:false,
     source_scope:"AUTHORIZED_BOT_DIRECT_SUBMISSION_HASH_ONLY",
     unverified_research_lead:true,
     factual_news_item:false,
     original_publisher_page_verified:false,
     independent_non_telegram_corroboration:false,
     commercial_reuse_authorized:false,
     ai_processing_consent_asserted_by_this_api:false,
     source_content_included:false,raw_article_included:false,
     public_customer_delivery_authorized:false,
     signed_risk_object_authorized:false,payment_authorized:false,
   }));
   return json({ok:true,schema:PRIVATE_TELEGRAM_JSON_SCHEMA,
     delivery_scope:"PROTECTED_INTERNAL_RESEARCH_ONLY",
     retained_hours:TELEGRAM_AUTHORIZED_RESEARCH_RETENTION_HOURS,
     telegram_source_registry_scope:"AUTHORIZED_DIRECT_SUBMISSIONS_ONLY",
     is_global_195_live_verified:false,public_news_reuse_authorized:false,
     commercial_rights_granted:false,
     country_filter:country,category_filter:category,
     offset:Number(offset),page_size:100,
     has_more:rows.length>100,next_offset:rows.length>100&&Number(offset)<200?Number(offset)+100:null,
     items,
     payment_required_now:false,chargeable:false,unscored:true,
   });
 }catch{
   return json({ok:false,error:"TELEGRAM_RESEARCH_D1_UNAVAILABLE",items:[],
     payment_required_now:false},503);
 }
}
