// NONCOMMERCIAL source-page provenance pins for the existing newsroom only.
// No source organization, independent corroboration or legal grant is inferred.
import {GLOBAL_OFFICIAL_RELEASE_FEEDS,globalOriginalArticleUrl} from "./global-official-release-feeds.mjs";
const gov=/^\/government\/(?:news|speeches|statements|world-location-news|publications)\/[a-z0-9][a-z0-9/-]{3,230}$/u;
const groups=[
 [{uk_fcdo:"geopolitics",uk_cabinet:"geopolitics",uk_mod:"geopolitics",uk_home:"geopolitics",
   uk_ofsi_sanctions:"geopolitics",uk_otsi_trade_sanctions:"geopolitics",
   uk_treasury:"macro",uk_dbt_macro:"macro",uk_energy:"rare_earth",uk_dbt:"rare_earth"},["www.gov.uk"],gov],
 [{fed_press:"macro"},["www.federalreserve.gov"],/^\/newsevents\/pressreleases\/[A-Za-z0-9_-]+\.htm$/u],
 [{ecb_press:"macro",ecb_stats:"macro"},["www.ecb.europa.eu"],/^\/press\/(?:pr|key|stats)\/(?:date\/20\d{2}\/html\/|html\/|[a-z]{2,16}\/20\d{2}\/html\/)[A-Za-z0-9.~_-]{6,190}\.html$/u],
 [{statcan_prices:"macro",statcan_accounts:"macro",statcan_trade:"macro",statcan_labour:"macro"},
  ["www150.statcan.gc.ca","www.statcan.gc.ca"],/^\/(?:n1\/(?:en\/)?)?daily-quotidien\/\d{6}\/dq\d{6}[a-z0-9-]+-eng\.htm(?:l)?$/iu],
 [{un_news:"geopolitics",un_news_security:"geopolitics",un_news_africa:"geopolitics"},["news.un.org"],/^\/en\/story\/20\d{2}\/\d{1,2}\/[a-z0-9-]{3,160}\/?$/u],
 [{nz_beehive_geopolitics:"geopolitics",nz_beehive_macro:"macro",nz_beehive_minerals:"rare_earth"},["www.beehive.govt.nz"],/^\/(?:release|speech)\/[a-z0-9][a-z0-9-]{4,180}$/u],
 [{wto_trade_original_rss:"macro"},["www.wto.org"],/^\/english\/news_e\/(?:news|pres)\d{2}_e\/[a-z0-9_.-]{4,150}\.htm$/u],
 [{eia_press_macro:"macro"},["www.eia.gov"],/^\/pressroom\/releases\/press[1-9][0-9]{1,5}\.php$/u],
 [{bls_cpi:"macro"},["www.bls.gov"],/^\/news\.release\/(?:cpi\.nr[0-9]+|archives\/cpi_[0-9]{8})\.htm$/u],
 [{bls_employment:"macro"},["www.bls.gov"],/^\/news\.release\/(?:empsit\.nr[0-9]+|archives\/empsit_[0-9]{8})\.htm$/u],
 [{bls_external_prices:"macro"},["www.bls.gov"],/^\/news\.release\/(?:ximpim\.nr[0-9]+|archives\/ximpim_[0-9]{8})\.htm$/u],
 [{nrcan_releases:"rare_earth"},["www.canada.ca"],/^\/en\/natural-resources-canada\/news\/20\d{2}\/\d{2}\/[a-z0-9-]+\.html$/u],
 [{canada_foreign_statements:"geopolitics"},["www.canada.ca"],/^\/en\/global-affairs\/news\/20\d{2}\/\d{2}\/[a-z0-9-]+\.html$/u],
 [{nrcan_science:"rare_earth"},["natural-resources.canada.ca","www.natural-resources.canada.ca"],/^\/simply-science\/[a-z0-9][a-z0-9/-]{4,230}$/u],
 [{au_geoscience:"rare_earth"},["www.ga.gov.au"],/^\/news\/[a-z0-9][a-z0-9/-]{4,230}$/u],
 [{au_industry_minister:"rare_earth",au_resources_macro_index:"macro",au_resources_minerals_index:"rare_earth",au_resources_geopolitics_index:"geopolitics"},["www.minister.industry.gov.au"],/^\/(?:t-ayres|king)\/media\/[a-z0-9][a-z0-9-]{4,230}$/u],
 [{us_doe_news_minerals:"rare_earth",us_doe_cmei_minerals_index:"rare_earth"},["www.energy.gov"],/^\/(?:[a-z0-9-]+\/)?articles\/[a-z0-9][a-z0-9-]{4,230}$/u],
 [{eu_representation_news:"rare_earth"},["luxembourg.representation.ec.europa.eu"],/^\/(?:news|news-and-events)\/[a-z0-9][a-z0-9/-]{4,230}(?:_en)?$/u],
 [{eu_top_news:"rare_earth"},["single-market-economy.ec.europa.eu"],/^\/news\/[a-z0-9][a-z0-9-]{4,230}(?:_en)?$/u],
 [{eurostat_economy_release:"macro"},["ec.europa.eu"],/^\/eurostat\/(?:web\/products-euro-indicators\/w\/|en\/web\/products-euro-indicators\/w\/)[a-z0-9-]+$/u],
];
export function pinnedDerivedOriginalReference(ref){
 if(!ref||typeof ref!=="object"||typeof ref.articleUrl!=="string"||ref.articleUrl.length>1600)return null;
 let u;try{u=new URL(ref.articleUrl)}catch{return null}
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||
    u.href!==ref.articleUrl||u.pathname.startsWith("//")||/%(?:2f|5c|2e)/iu.test(u.pathname))return null;
 const global=GLOBAL_OFFICIAL_RELEASE_FEEDS.find(s=>(s.id===ref.sourceId||s.websiteId===ref.sourceId)&&s.category===ref.category);
 if(global&&globalOriginalArticleUrl(ref.articleUrl,global)===ref.articleUrl)return u;
 return groups.some(([ids,hosts,path])=>Object.hasOwn(ids,ref.sourceId)&&
  ids[ref.sourceId]===ref.category&&hosts.includes(u.hostname)&&path.test(u.pathname))?u:null;
}
