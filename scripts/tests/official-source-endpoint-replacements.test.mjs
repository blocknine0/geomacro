import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const json=path=>JSON.parse(readFileSync(new URL("../../"+path,import.meta.url),"utf8"));
test("IDN and recorded unhealthy country adapters point to first-party RSS alternatives",()=>{
 const local=json("config/private-osint-local-rss-candidates.v1.json");
 const idn=local.sources.find(row=>row.id==="private_local_candidate_id_antara");
 assert.equal(idn.publisher_country_iso3,"IDN");
 assert.equal(idn.url,"https://www.esdm.go.id/en?format=feed&type=rss");
 assert.equal(idn.discovery_reference_url,"https://www.esdm.go.id/en");
 assert.equal(idn.type,"rss");
 assert.equal(idn.provider_rights_verified,false);
 assert.equal(idn.commercial_eligible,false);
 const regional=json("config/private-osint-regional-corridor-additions.v1.json").sources;
 const lso=regional.find(row=>row.id==="private_expansion_lso_gov");
 assert.equal(lso.publisher_country_iso3,"LSO");
 assert.equal(lso.url,"https://www.gov.ls/feed/");
 assert.equal(lso.discovery_reference_url,"https://www.gov.ls/news/");
 assert.equal(lso.type,"rss");
 assert.equal(lso.provider_rights_verified,false);
 assert.equal(lso.commercial_eligible,false);
 const backups=json("config/hot-50-retired-direct-feed-backups.v1.json").sources;
 const replacements=new Map(backups.map(row=>[row.retired_source_id,row]));
 for(const id of ["private_expansion_au_industry_news","private_expansion_australian_mining"]){
  const row=replacements.get(id);
  assert.match(row.url,/^https:\/\/www\.minister\.industry\.gov\.au\/feed\//u);
  assert.equal(row.type,"rss");
  assert.equal(row.commercial_eligible,false);
 }
 const ind=replacements.get("private_expansion_ind_tax_press");
 assert.equal(ind.url,"https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1");
 assert.equal(ind.publisher_country_iso3,"IND");
 assert.equal(ind.commercial_eligible,false);
 const auIndustry=regional.find(row=>row.id==="private_expansion_au_industry_news");
 assert.equal(auIndustry.url,"https://www.minister.industry.gov.au/feed/all-media/rss.xml");
 assert.equal(auIndustry.commercial_eligible,false);
 const mining=regional.find(row=>row.id==="private_expansion_australian_mining");
 assert.equal(mining.url,"https://www.minister.industry.gov.au/feed/media-releases/rss.xml");
 assert.equal(mining.commercial_eligible,false);
});

test("Botswana official bank feeds are discoverable through the bank's documented RSS service",()=>{
 const additions=json("config/private-osint-regional-corridor-additions.v1.json").sources;
 const ids=new Map(additions.map(row=>[row.id,row]));
 const rates=ids.get("private_expansion_bw_bankofbotswana_fx");
 const news=ids.get("private_expansion_bw_bankofbotswana_news");
 assert.equal(rates.publisher_country_iso3,"BWA");
 assert.equal(rates.url,"https://www.bankofbotswana.bw/rss/exchanges");
 assert.equal(news.url,"https://www.bankofbotswana.bw/rss/latest_news");
 assert.equal(rates.discovery_reference_url,"https://www.bankofbotswana.bw/content/rss-feeds");
 assert.equal(rates.commercial_eligible,false);
 assert.equal(news.commercial_eligible,false);
});
