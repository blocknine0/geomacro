import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {privateUnverifiedOsintRegistry,collectPrivateUnverifiedOsint} from "./private-unverified-osint-intake.mjs";
import {CONTINENT_COUNTRIES_195} from "./continent-country-195-rotation.mjs";

const file=new URL("../../config/private-osint-local-gaplane.v1.json",import.meta.url);
const now=new Date("2026-10-27T12:00:00Z");
const normalize=x=>({
 schema:"geomacro.reusable-news-json.v1",category:x.category,country_iso3:x.country_iso3??null,
 source:{publisher_name:null,original_url:null,original_published_at:x.published_at},
 usage_rights:{commercial_reuse_authorized:false},delivery:{raw_article_included:false},
});
test("independent source gap lane leaves 511-source production collector untouched",()=>{
 const manifest=JSON.parse(readFileSync(file,"utf8"));
 assert.equal(manifest.schema,"geomacro.private-osint-local-gaplane.v1");
 assert.ok(manifest.sources.length>30&&manifest.sources.length<=100);
 const canonical=new Set(Object.values(CONTINENT_COUNTRIES_195).flat());
 assert.ok(manifest.sources.every(s=>canonical.has(s.publisher_country_iso3)));
 const legacy=privateUnverifiedOsintRegistry();
 assert.equal(legacy.length,25);
 const merged=privateUnverifiedOsintRegistry(undefined,{includeGapLane:true});
 assert.equal(merged.length,25+manifest.sources.length+2);
 assert.ok(merged.length<=128);
 assert.equal(new Set(merged.map(x=>x.url)).size,merged.length);
 const gaps=merged.filter(x=>x.id.startsWith("private_gaplane_"));
 assert.equal(gaps.length,manifest.sources.length);
 assert.ok(gaps.every(s=>s.access==="rss"&&s.supported===true&&
   s.categories.length===3&&s.activation_state==="PRIVATE_UNVERIFIED_OBSERVATION"&&
   s.publisher_country_iso3===s.publisher_countries[0]&&
   s.rights_verified===false&&s.publicly_deliverable===false));
 assert.equal(new Set(gaps.map(s=>s.publisher_country_iso3)).size,gaps.length-2);
 const nonRss=merged.filter(s=>s.id.startsWith("private_official_nonrss_"));
 assert.deepEqual(nonRss.map(s=>s.publisher_country_iso3).sort(),["NRU","PRK"]);
 assert.ok(nonRss.every(s=>s.supported===false&&s.access==="bulk"&&
   s.type==="html"&&s.native_news_emission_enabled===false&&
   s.transport_verified_at_registration===false));

});
test("country-source candidate is never a country event; only real native clock counts",async()=>{
 const s=privateUnverifiedOsintRegistry(undefined,{includeGapLane:true})
  .find(s=>s.id==="private_gaplane_aut_1");
 assert.ok(s);
 const good='<rss><channel><item><title>Austria central bank announces inflation measures</title>'+
  '<pubDate>Tue, 27 Oct 2026 11:55:00 GMT</pubDate></item></channel></rss>';
 const observed=await collectPrivateUnverifiedOsint({
  now,registry:[s],normalize,resolveCountry:()=>null,
  fetchImpl:async()=>new Response(good,{status:200}),
 });
 assert.equal(observed.summary.source_checks,3);
 assert.ok(observed.summary.source_states.OBSERVED>=1);
 assert.ok(observed.items.length>=1);
 assert.ok(observed.items.every(x=>x.country_iso3===null));
 const denied=await collectPrivateUnverifiedOsint({
  now,registry:[s],normalize,resolveCountry:()=>null,
  fetchImpl:async()=>new Response("<html>blocked</html>",{status:403}),
 });
 assert.equal(denied.items.length,0);
 assert.equal(denied.summary.source_states.DENIED,3);
});

test("Nauru and DPRK official non-RSS responses never count as dated news",async()=>{
 const nonRss=privateUnverifiedOsintRegistry(undefined,{includeGapLane:true})
  .filter(s=>s.id.startsWith("private_official_nonrss_"));
 const result=await collectPrivateUnverifiedOsint({
  now,registry:nonRss,normalize,resolveCountry:()=>null,
  fetchImpl:async()=>new Response("<html><time datetime='2026-10-27'>fake news</time></html>",{status:200}),
 });
 assert.equal(result.items.length,0);
 assert.equal(result.summary.source_checks,6);
 assert.equal(result.summary.source_states.UNSUPPORTED_FORMAT,6);
 assert.equal(result.summary.source_verified_active,false);
});
