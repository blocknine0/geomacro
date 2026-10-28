/**
 * GOV.UK first-party precise ORIGINAL date rescue for an already pinned
 * GOV.UK HTML article. Uses the issuer's /api/content/{base_path}
 * first_published_at, never public_updated_at / crawl time / URL date.
 *
 * This yields only internal page/native-clock metadata. It is NOT an
 * independent source, commercial-rights decision, GRI or certificate.
 */
const MAX=128*1024;
const DATE=/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,9})?)?(?:Z|[+-]\d\d:?\d\d)$/iu;
const PATH=/^\/government\/(?:news|speeches|statements|world-location-news|publications)\/[a-z0-9][a-z0-9-]{4,190}$/u;
const DOC_TYPES=new Set(["news_story","press_release","speech","statement","publication","world_location_news_article"]);
const decode=s=>String(s).replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/giu,m=>({
 "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'","&#39;":"'","&nbsp;":" "
}[m.toLowerCase()]??" "));
const title=s=>decode(String(s)).replace(/<[^>]*>/gu," ").replace(/\s+/gu," ").trim().toLowerCase();
const words=s=>new Set(title(s).match(/[a-z]{5,}/gu)??[]);
const aligned=(a,b)=>{
 const x=words(a),y=words(b);
 return x.size>0&&y.size>0&&[...x].filter(w=>y.has(w)).length>=Math.min(2,x.size);
};
export function pinnedGovUkContentApiUrl(raw) {
 try{
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.hostname!=="www.gov.uk"||
     u.username||u.password||u.port||u.search||u.hash||
     !PATH.test(u.pathname)||u.href.length>350)return null;
  return "https://www.gov.uk/api/content"+u.pathname;
 }catch{return null;}
}
/**
 * @param {{articleUrl?: string, html?: string, contentJson?: string,
 *   articleTitle?: string|null, now?: Date, maxAgeMs?: number}} [options]
 */
export function verifiedGovUkContentFirstPublishedAt({
 articleUrl,html,contentJson,articleTitle=null,now=new Date(),maxAgeMs=22*3600_000
}={}){
 const api=pinnedGovUkContentApiUrl(articleUrl);
 if(!api||typeof html!=="string"||html.length<50||html.length>384*1024||
    typeof contentJson!=="string"||Buffer.byteLength(contentJson)>MAX||
    !(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Number.isSafeInteger(maxAgeMs)||maxAgeMs<=0||maxAgeMs>31*86400_000)
  return null;
 const heading=html.match(/<h1(?:\s[^>]*)?>([\s\S]{0,2500}?)<\/h1\s*>/iu)?.[1];
 if(!heading||title(heading).length<8)return null;
 let page;
 try{page=JSON.parse(contentJson)}catch{return null;}
 const at=page?.first_published_at;
 const path=new URL(articleUrl).pathname;
 if(!page||Array.isArray(page)||page.base_path!==path||
    typeof page.title!=="string"||page.title.length<8||
    !DOC_TYPES.has(page.document_type)||
    !aligned(heading,page.title)||
    (articleTitle!==null&&(!aligned(articleTitle,page.title)||
      !aligned(articleTitle,heading)))||
    typeof at!=="string"||!DATE.test(at)||
    page.publication_state==="withdrawn")return null;
 const original=new Date(at),epoch=original.getTime();
 if(!Number.isFinite(epoch)||epoch>now.getTime()||
    now.getTime()-epoch>maxAgeMs)return null;
 // Reject impossible calendar dates and an invented timezone. Use the
 // publisher's exact precise first-published instant, never updated-at.
 const parts=/^(\d{4})-(\d\d)-(\d\d)T/u.exec(at);
 const y=Number(parts?.[1]),m=Number(parts?.[2]),d=Number(parts?.[3]);
 const day=new Date(Date.UTC(y,m-1,d));
 if(day.getUTCFullYear()!==y||day.getUTCMonth()!==m-1||
    day.getUTCDate()!==d)return null;
 return original.toISOString();
}
