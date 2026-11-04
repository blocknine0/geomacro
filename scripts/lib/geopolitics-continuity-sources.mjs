/** Failover publisher feeds for geopolitics on the existing 20-minute private collector.
 * These are fixed RSS/Atom original-publisher DISCOVERY candidates, never a
 * bypass for denied feeds, original-page verification, licensing or scoring.
 * Priority affects fetch order only. A failed source remains failed.
 */
const RAW=Object.freeze([
 ["un_headquarters_press","https://press.un.org/en/rss.xml","rss",null,"global","official"],
 ["un_geneva_press","https://www.ungeneva.org/news-media/press-releases-list/rss.xml","rss",null,"global","official"],
 ["eu_council_press","https://www.consilium.europa.eu/en/rss/pressreleases.ashx","rss",null,"global","official"],
 ["un_peace_security","https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml","rss",null,"global","official"],
 ["un_middle_east","https://news.un.org/feed/subscribe/en/news/region/middle-east/feed/rss.xml","rss",null,"global","official"],
 ["uk_fcdo","https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom","atom","GBR","europe","official"],
 ["uk_defence","https://www.gov.uk/government/organisations/ministry-of-defence.atom","atom","GBR","europe","official"],
 ["uk_financial_sanctions","https://www.gov.uk/government/organisations/office-of-financial-sanctions-implementation.atom","atom","GBR","europe","official"],
 ["uk_trade_sanctions","https://www.gov.uk/government/organisations/office-of-trade-sanctions-implementation.atom","atom","GBR","europe","official"],
 ["canada_global_affairs","https://api.io.canada.ca/io-server/gc/news/en/v2?atomtitle=Global+Affairs+Canada+statements&dept=departmentofforeignaffairstradeanddevelopment&format=atom&orderBy=desc&pick=50&publishedDate%3E=2015-01-01&sort=publishedDate&type=statements","atom","CAN","north_america","official"],
 ["us_presidential_actions","https://www.whitehouse.gov/presidential-actions/feed/","rss","USA","north_america","official"],
 ["wto_trade_news","https://www.wto.org/library/rss/latest_news_e.xml","rss",null,"global","official"],
 ["nz_pacific_news","https://www.rnz.co.nz/rss/pacific.xml","rss","NZL","oceania","editorial"],
 ["ukraine_local_news","https://www.pravda.com.ua/eng/rss/view_news/","rss","UKR","europe","editorial"],
 ["philippines_national_news","https://www.philstar.com/rss/nation","rss","PHL","asia","editorial"]
]);
const CATEGORIES=Object.freeze(["geopolitics"]);
export function geopoliticsContinuitySources(){
 const sources=RAW.map(([suffix,url,type,publisher_country_iso3,continent,publisher_kind])=>{
   const id="private_geo_continuity_"+suffix;
   const u=new URL(url);
   if(!/^private_geo_continuity_[a-z0-9_]+$/u.test(id)||
      u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
      !u.hostname.includes(".")||!["rss","atom"].includes(type)||
      !["official","editorial"].includes(publisher_kind)||
      !(publisher_country_iso3===null||/^[A-Z]{3}$/u.test(publisher_country_iso3))||
      (continent==="global")!==(publisher_country_iso3===null))
      throw Error("GEOPOLITICS_CONTINUITY_SOURCE_INVALID");
   return Object.freeze({
     id,url,type,continent,publisher_country_iso3,publisher_kind,
     categories:CATEGORIES,supported:true,
     private_geopolitics_continuity:true,
     publisher_native_dates_required:true,
     original_article_verified:false,
     transport_verified_at_registration:false,
     provider_rights_verified:false,
     commercial_eligible:false,
     publicly_deliverable:false,
   });
 });
 if(sources.length!==15||new Set(sources.map(s=>s.url)).size!==sources.length||
    new Set(sources.map(s=>s.id)).size!==sources.length)
   throw Error("GEOPOLITICS_CONTINUITY_INVENTORY_DRIFT");
 return Object.freeze(sources);
}
