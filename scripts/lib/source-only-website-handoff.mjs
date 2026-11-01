/** Existing 15-minute source sweep -> ephemeral, bounded candidate handoff.
 * This never reads another feed, publishes original text, grants rights,
 * or asserts that a 195x3 routing cell contains genuine news.
 */
export const SOURCE_WEBSITE_HANDOFF_LIMIT_PER_CATEGORY=120;
const CAT=["geopolitics","macro","rare_earth"];
const AGE=72*3600_000;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
export function planSourceWebsiteHandoff(candidates,{now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Array.isArray(candidates)||candidates.length>5000)
   throw Error("SOURCE_WEBSITE_HANDOFF_ARGUMENTS_INVALID");
 const lanes=new Map(CAT.map(c=>[c,new Map()]));
 const conflict=new Map(CAT.map(c=>[c,new Set()]));
 let unsafe=0,expired=0;
 for(const r of candidates){
   if(!r||!CAT.includes(r.category)||typeof r.title!=="string"||
      r.title.length<25||r.title.length>250||
      /[<>]|https?:\/\//iu.test(r.title)||
      typeof r.articleUrl!=="string"||typeof r.sourceUrl!=="string"||
      typeof r.publishedAt!=="string"||!ISO.test(r.publishedAt)){
     unsafe++;continue;
   }
   let source,article;
   try{source=new URL(r.sourceUrl);article=new URL(r.articleUrl)}catch{unsafe++;continue}
   if(source.protocol!=="https:"||source.username||source.password||source.port||source.hash||
      article.protocol!=="https:"||article.username||article.password||article.port||
      article.hash||article.href.length>1800||!source.hostname.includes(".")||
      !article.hostname.includes(".")){unsafe++;continue}
   const published=Date.parse(r.publishedAt);
   if(!Number.isFinite(published)||new Date(published).toISOString()!==r.publishedAt||
      published>now.getTime()||
      now.getTime()-published>=AGE){expired++;continue}
   const key=article.href+"|"+r.publishedAt;
   const originals=lanes.get(r.category),bad=conflict.get(r.category);
   if(bad.has(key))continue;
   const previous=originals.get(key);
   if(previous&&previous.title!==r.title){
     originals.delete(key);bad.add(key);continue;
   }
   if(!previous)originals.set(key,{
     source_url:source.href,article_url:article.href,title:r.title,
     category:r.category,published_at:r.publishedAt,
   });
 }
 const byCategory={},selected=[];
 for(const category of CAT){
   const rows=[...lanes.get(category).values()].sort((a,b)=>
     b.published_at.localeCompare(a.published_at)||
     a.article_url.localeCompare(b.article_url));
   // A permanently newest-120 selection starves the 121st native article
   // whenever a high-volume global source remains busy. Keep the 24 freshest
   // original dates immediately discoverable, then rotate 96 deeper originals
   // through the same 15-minute protected production slots. This is a finite
   // in-memory sweep, not a durable queue or a promise of complete coverage.
   const limit=SOURCE_WEBSITE_HANDOFF_LIMIT_PER_CATEGORY;
   const newest=rows.slice(0,Math.min(24,limit));
   const depth=rows.slice(newest.length);
   const deepQuota=limit-newest.length;
   const offset=depth.length?(Math.floor(now.getTime()/900_000)*deepQuota)%depth.length:0;
   const rotating=[];
   for(let i=0;i<Math.min(deepQuota,depth.length);i++)
     rotating.push(depth[(offset+i)%depth.length]);
   const allowed=[...newest,...rotating];
   byCategory[category]={observed:rows.length,selected:allowed.length,
      deferred_to_fresh_reobservation:rows.length-allowed.length,
      newest_native_candidates:Math.min(24,rows.length),
      conflict_quarantined:conflict.get(category).size};
   selected.push(...allowed);
 }
 return Object.freeze({schema:"geomacro.source-only-ephemeral-website-handoff.v1",
   checked_at:now.toISOString(),by_category:byCategory,rows:selected,
   source_fetched_once:true,requires_full_research_admission:true,
   source_urls_must_stay_private:true,public_source_bytes_not_included:true,
   automatic_publication_unproven:true,
   unsafe_dropped:unsafe,stale_or_future_dropped:expired,
   predge_unchanged:true,payments:0});
}
