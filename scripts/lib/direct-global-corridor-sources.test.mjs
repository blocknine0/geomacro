import test from "node:test";
import assert from "node:assert/strict";
import {DIRECT_GLOBAL_CORRIDOR_SOURCES,assertDirectGlobalCorridorRegistry,
  directGlobalCorridorNewsFeeds,directGlobalCorridorRouteSources,
  directGlobalCorridorSourceCensus,assertDirectCorridorWebsiteSeparation,
  suppliedGlobalCorridorDirectory} from "./direct-global-corridor-sources.mjs";
import {registeredReusableNewsSources} from "./registered-reusable-news-source-collector.mjs";

test("all original 38 Markdown links plus official ASEAN customs follow-up are preserved",()=>{
 assert.equal(assertDirectGlobalCorridorRegistry(),true);
 const input=suppliedGlobalCorridorDirectory();
 assert.equal(input.references.length,39);
 assert.equal(new Set(input.references.map(x=>x.linked_target_url)).size,37);
 assert.equal(new Set(input.references.map(x=>x.source_id)).size,37);
 assert.equal(input.original_markdown_link_occurrences,38);
 assert.equal(input.followup_submitted_link_occurrences,1);
 assert.equal(input.unresolved_removed_links.length,0);
 assert.equal(input.resolved_removed_links.length,1);
 assert.equal(input.resolved_removed_links[0].source_id,"asean_customs");
 assert.deepEqual(input.references[38],{
   reference_index:39,source_id:"asean_customs",
   label:"ASEAN Customs — Official ASEAN Economic Community Portal",section:"apac",
   supplied_url:"https://asean.org/our-communities/economic-community/asean-customs/",
   linked_target_url:"https://asean.org/our-communities/economic-community/asean-customs/"
 });
 assert.deepEqual(input.references.map((x,i)=>x.reference_index),Array.from({length:39},(_,i)=>i+1));
 assert.equal(input.references.filter(x=>x.source_id==="panama_canal").length,2);
 assert.equal(input.references.filter(x=>x.source_id==="ukmto_incidents").length,2);
 assert.ok(input.references.find(x=>x.source_id==="cryptocompare_news")
    .linked_target_url.startsWith("https://min-api.cryptocompare.com/documentation?"));
 assert.ok(input.references.some(x=>x.supplied_url.startsWith("http://data.gdeltproject.org/")));
 assert.ok(input.references.some(x=>x.supplied_url.startsWith("https://www.google.com/search?q=")));
});
test("all 75 registry entries remain in separate corridor lane, not D1 website news",()=>{
 const sources=directGlobalCorridorRouteSources();
 assert.equal(assertDirectCorridorWebsiteSeparation(),true);
 assert.equal(sources.length,75);
 assert.deepEqual(directGlobalCorridorNewsFeeds(),[]);
 assert.equal(new Set(sources.map(x=>x.id)).size,75);
 assert.equal(sources.reduce((n,x)=>n+x.source_references.length,0),39);
 assert.ok(sources.every(x=>x.channel==="CORRIDOR_ONLY"&&
   x.website_intelligence_enabled===false&&x.commercial_eligible===false));
 const existing=registeredReusableNewsSources();
 for(const id of ["boe_news","coindesk_rss","cointelegraph_rss"]){
   const src=DIRECT_GLOBAL_CORRIDOR_SOURCES.find(x=>x.id===id);
   assert.ok(src);
   assert.ok(!existing.some(x=>x.id==="direct_"+id));
 }
 const receipt=directGlobalCorridorSourceCensus();
 assert.equal(receipt.registered,75);
 assert.equal(receipt.source_link_occurrences,39);
 assert.equal(receipt.linked_unique_sources,37);
 assert.equal(receipt.website_intelligence_sourced_feeds,0);
 assert.equal(receipt.production_readbacks_proven,false);
 assert.equal(receipt.paid_publication_authorized,false);
});
test("Zambia and missing-country central-bank portals use the existing unactivated portal schema",()=>{
 const byId=new Map(DIRECT_GLOBAL_CORRIDOR_SOURCES.map(source=>[source.id,source]));
 const expected=[
  ["zmb_boz_public_notices","https://www.boz.zm/news/public-notices","geopolitics","africa"],
  ["fra_banque_france_news","https://www.banque-france.fr/fr/actualites-et-evenements","macro","europe"],
  ["ita_bancaditalia_news","https://www.bancaditalia.it/media/notizie/","macro","europe"],
  ["esp_bde_news","https://www.bde.es/wbe/es/noticias-eventos/","macro","europe"],
  ["nld_dnb_news","https://www.dnb.nl/en/news/","macro","europe"],
  ["bel_nbb_news","https://www.nbb.be/en/news","macro","europe"],
  ["nor_norges_bank_news","https://www.norges-bank.no/en/news-events/","macro","europe"],
  ["swe_riksbank_press","https://www.riksbank.se/en-gb/press-and-published/","macro","europe"],
  ["pol_nbp_news","https://nbp.pl/en/","macro","europe"],
  ["tur_tcmb_announcements","https://www.tcmb.gov.tr/wps/wcm/connect/EN/TCMB+EN/Main+Menu/Announcements","macro","europe"],
  ["jpn_boj_home","https://www.boj.or.jp/en/","macro","apac"],
  ["kor_bok_home","https://www.bok.or.kr/eng/","macro","apac"],
  ["aus_rba_media_releases","https://www.rba.gov.au/media-releases/","macro","apac"],
  ["sgp_mas_news","https://www.mas.gov.sg/news","macro","apac"],
  ["idn_bi_home","https://www.bi.go.id/en/","macro","apac"],
  ["mys_bnm_home","https://www.bnm.gov.my/","macro","apac"],
  ["phl_bsp_home","https://www.bsp.gov.ph/","macro","apac"],
  ["tha_bot_home","https://www.bot.or.th/en/home.html","macro","apac"],
  ["vnm_sbv_home","https://www.sbv.gov.vn/","macro","apac"],
  ["bgd_bangladesh_bank_home","https://www.bb.org.bd/","macro","apac"],
  ["pak_sbp_home","https://www.sbp.org.pk/","macro","apac"],
  ["kaz_national_bank_home","https://www.nationalbank.kz/en","macro","apac"],
  ["mng_mongolbank_home","https://www.mongolbank.mn/en","macro","apac"],
  ["mmr_central_bank_myanmar_home","https://www.cbm.gov.mm/","macro","apac"],
  ["sau_sama_home","https://www.sama.gov.sa/en-us/","macro","mena"],
  ["are_central_bank_uae_home","https://www.centralbank.ae/en","macro","mena"],
  ["qat_qcb_home","https://www.qcb.gov.qa/en","macro","mena"],
  ["omn_cbo_home","https://cbo.gov.om/","macro","mena"],
  ["egy_cbe_home","https://www.cbe.org.eg/en","macro","mena"],
  ["isr_boi_home","https://www.boi.org.il/en/","macro","mena"],
  ["irq_cbi_news","https://cbi.iq/news","macro","mena"],
  ["mex_banxico_home","https://www.banxico.org.mx/","macro","latam"],
  ["arg_bcra_home","https://www.bcra.gob.ar/","macro","latam"],
  ["chl_bcentral_home","https://www.bcentral.cl/en","macro","latam"],
  ["per_bcrp_home","https://www.bcrp.gob.pe/","macro","latam"],
  ["bol_bcb_home","https://www.bcb.gob.bo/","macro","latam"],
  ["nga_cbn_home","https://www.cbn.gov.ng/","macro","africa"],
  ["cod_bcc_home","https://www.bcc.cd/","macro","africa"],
 ];
 for(const [id,url,category,corridor] of expected){
  assert.deepEqual(byId.get(id),{id,name:byId.get(id)?.name,url,format:"portal",
    categories:[category],corridors:[corridor],state:"PORTAL_ENDPOINT_REQUIRED"});
 }
 assert.equal(expected.length,38);
 assert.equal(byId.has("gbr_boe_news"),false);
 assert.equal(byId.get("boe_news").url,"https://www.bankofengland.co.uk/rss/news");
 assert.equal(byId.has("bra_bcb_home"),false);
 assert.equal(byId.get("bcb_brazil").url,"https://www.bcb.gov.br/en");
});
test("source directory does not infer direct event extraction from documentation",()=>{
 const map=new Map(DIRECT_GLOBAL_CORRIDOR_SOURCES.map(x=>[x.id,x]));
 for(const id of ["gdelt_cameo_codebook","reliefweb_v2","world_bank_wdi",
   "imf_data","wto_tariffs","fred_api","freightos_fbx","iea_minerals"]){
   assert.ok(map.has(id));
 }
 assert.equal(map.get("asean_customs").url,
   "https://asean.org/our-communities/economic-community/asean-customs/");
 assert.equal(map.get("asean_customs").state,"PORTAL_ENDPOINT_REQUIRED");
 assert.equal(map.get("asean_customs").format,"portal");
 assert.ok(DIRECT_GLOBAL_CORRIDOR_SOURCES.every(x=>
   x.url===null||x.url.startsWith("https://")));
 assert.ok(directGlobalCorridorRouteSources().every(x=>x.risk_gate_verified===false));
});
