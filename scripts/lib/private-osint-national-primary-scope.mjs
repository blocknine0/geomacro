/**
 * Explicit domestic-issuer scope, not a general publisher-country fallback.
 * Only exact first-party release URLs may gain a domestic-context hint.
 * Scope does not prove the event happened domestically or grant paid rights.
 */
const PINNED=new Map([
 ["https://www.rba.gov.au/rss/rss-cb-media-releases.xml","AUS"],
 ["https://www.resbank.co.za/bin/sarb/solr/publications/rss","ZAF"],
 ["https://www.statssa.gov.za/?feed=rss2","ZAF"],
 ["https://www.centralbank.go.ke/feed/","KEN"],
 ["https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=atom&atomtitle=Natural%20Resources%20Canada","CAN"],
 ["https://www.rbi.org.in/pressreleases_rss.xml","IND"],
 ["https://www.cochilco.cl/web/noticias/feed/","CHL"],
 ["https://www.industry.gov.au/news.xml","AUS"],
 ["https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1","IND"],
 ["https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3","IND"],
 ["https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=5","IND"],
 ["https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=6","IND"],
 ["https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=17","IND"],
 ["https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=20","IND"],
 ["https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=22","IND"],
]);
export const NATIONAL_PRIMARY_PINNED_COUNT=PINNED.size;
export function qualifyPrivateNationalPrimaryScope(source){
 if(!source||typeof source.url!=="string"||
    PINNED.get(source.url)!==source.publisher_country_iso3||
    source.private_discovery_index_only===true||
    source.private_hub_overlay===true)return source;
 return {...source,scope:"national_primary",
   domestic_event_context:"PUBLISHER_DOMESTIC_SCOPE_UNVERIFIED_EVENT"};
}
export function sourceIsPinnedNationalPrimary(source){
 return source?.scope==="national_primary"&&
   source.private_discovery_index_only!==true&&
   source.private_hub_overlay!==true&&
   PINNED.get(source.url)===source.publisher_country_iso3&&
   source.domestic_event_context==="PUBLISHER_DOMESTIC_SCOPE_UNVERIFIED_EVENT";
}
