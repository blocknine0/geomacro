/** Pinned regional publisher inventory; no coverage or verification grant. */
export const sectorFeed=(id,url,region,type='rss')=>Object.freeze({id,url,region,type});
export const MINERALS_MESH=Object.freeze([
 {region:'north_america',shared:['nrcan_releases','us_doe_news_minerals','bc_minerals_global'],primary:null,fallback:sectorFeed('mining_global','https://www.mining.com/feed/','global')},
 {region:'europe',shared:['uk_dbt','govuk_global_minerals'],primary:null,fallback:sectorFeed('bgs_news','https://www.bgs.ac.uk/feed/','europe')},
 {region:'oceania',shared:[],primary:sectorFeed('au_industry','https://www.industry.gov.au/news.xml','oceania'),fallback:sectorFeed('australian_mining','https://www.australianmining.com.au/feed/','oceania')},
 {region:'africa',shared:[],primary:sectorFeed('za_dsti','https://www.dsti.gov.za/rss.xml','africa'),fallback:sectorFeed('miningweekly','https://www.miningweekly.com/page/latest-news/feed','africa')},
 {region:'asia',shared:[],primary:sectorFeed('adb_minerals','https://www.adb.org/rss.xml','asia'),fallback:sectorFeed('mining_global','https://www.mining.com/feed/','global')},
 {region:'south_america',shared:[],primary:sectorFeed('guyana_mnr','https://mnr.gov.gy/feed/','south_america'),fallback:sectorFeed('mineria_desarrollo','https://www.mineriaydesarrollo.com/rss/mineria/','south_america')},
]);
export const MINERALS_SOURCE_IDS=Object.freeze([...new Set(MINERALS_MESH.flatMap(g=>[g.primary?.id,g.fallback.id]).filter(Boolean)), 'mining_technology','google_minerals','google_macro_metals','fxstreet_news']);
