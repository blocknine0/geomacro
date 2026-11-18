/** Pinned regional publisher inventory; no coverage or verification grant. */
export const sectorFeed=(id,url,region,type='rss')=>Object.freeze({id,url,region,type});
export const MINERALS_MESH=Object.freeze([
 {region:'north_america',shared:['nrcan_releases','us_doe_news_minerals','bc_minerals_global'],primary:null,fallback:sectorFeed('mining_technology','https://www.mining-technology.com/news/feed/','global')},
 {region:'europe',shared:['uk_dbt','govuk_global_minerals'],primary:null,fallback:sectorFeed('bgs_news','https://www.bgs.ac.uk/feed/','europe')},
 {region:'oceania',shared:[],primary:sectorFeed('au_industry','https://www.minister.industry.gov.au/feed/t-ayres/rss.xml','oceania'),fallback:sectorFeed('australian_mining_monthly','https://www.miningmonthly.com/feed/rss','oceania')},
 {region:'africa',shared:[],primary:sectorFeed('za_dsti','https://www.dsti.gov.za/rss.xml','africa'),fallback:sectorFeed('miningweekly','https://www.miningweekly.com/page/latest-news/feed','africa')},
 // ADB RSS usage notice is non-commercial and the old /rss.xml is denied.
 // Do not fetch it as a commercial original. This DOE open government RSS is
 // a worldwide discovery fallback, never proof of an Asian country event.
 {region:'asia',shared:[],primary:null,fallback:sectorFeed('us_doe_minerals_global','https://www.energy.gov/rss/energygov/2193718','global')},
 {region:'south_america',shared:[],primary:sectorFeed('guyana_mnr','https://mnr.gov.gy/feed/','south_america'),fallback:sectorFeed('mineria_desarrollo','https://www.mineriaydesarrollo.com/rss/mineria/','south_america')},
]);
export const MINERALS_SOURCE_IDS=Object.freeze([...new Set(MINERALS_MESH.flatMap(g=>[g.primary?.id,g.fallback.id]).filter(Boolean)), 'mining_technology','google_minerals','google_macro_metals','fed_press_official_radar']);
