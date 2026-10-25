import test from "node:test";
import assert from "node:assert/strict";
import {privateUnverifiedOsintRegistry,collectPrivateUnverifiedOsint} from "./private-unverified-osint-intake.mjs";
const now=new Date("2026-10-25T12:00:00.000Z");
const normalize=x=>({
 schema:"geomacro.reusable-news-json.v1",category:x.category,country_iso3:x.country_iso3??null,
 source:{publisher_name:null,original_url:null,original_published_at:x.published_at},
 usage_rights:{commercial_reuse_authorized:false},delivery:{raw_article_included:false}
});
const mk=(id,url,category,access)=>({
 id,url,categories:[category],access,type:access==="rss"?"rss":"json",
 supported:access==="rss",activation_state:"PRIVATE_UNVERIFIED_OBSERVATION",
 rights_verified:false,commercial_eligible:false,publicly_deliverable:false,
});
const rss='<rss><channel><item><title>India central bank announces inflation interest rate policy changes</title><pubDate>Sun, 25 Oct 2026 11:55:00 GMT</pubDate><link>https://secret.example.gov/article/1</link></item></channel></rss>';
test("private intake selects exactly the unverified state; never switches on held or paid endpoints",()=>{
 const sources=privateUnverifiedOsintRegistry();
 assert.equal(sources.length,25);
 assert.equal(sources.filter(x=>x.supported).length,5);
 assert.equal(sources.filter(x=>!x.supported).length,20);
 assert.equal(new Set(sources.map(x=>x.url)).size,25);
 assert.ok(sources.every(x=>x.url.startsWith("https://")&&x.rights_verified===false&&
   x.commercial_eligible===false&&x.publicly_deliverable===false));
 assert.ok(!sources.some(x=>/acled|sovereign_cds|cloudflare_radar|usa_fred/u.test(x.id)));
});
test("a real native RSS item becomes private unverified factual JSON; API 200 is never news",async()=>{
 const registry=[
  mk("private_unverified_feed","https://press.example.gov/rss","macro","rss"),
  mk("private_unverified_api","https://api.example.gov/v1","macro","api"),
  mk("private_unverified_denied","https://denied.example.gov/","geopolitics","bulk"),
 ];
 const calls=[];
 const result=await collectPrivateUnverifiedOsint({now,registry,normalize,resolveCountry:()=>null,
  fetchImpl:async(url,init)=>{
   calls.push({url,init});
   if(new URL(url).hostname==="denied.example.gov")return new Response("",{status:403});
   return new Response(new URL(url).hostname==="press.example.gov"?rss:"<html>API docs only</html>",{status:200});
  }});
 assert.equal(calls.length,3);
 assert.ok(calls.every(c=>c.init.method==="GET"&&c.init.redirect==="manual"&&
   !c.init.headers?.authorization&&!c.init.body));
 assert.equal(result.items.length,1);
 assert.equal(result.checks.length,3);
 assert.equal(result.summary.source_states.OBSERVED,1);
 assert.equal(result.summary.source_states.DENIED,1);
 assert.equal(result.summary.source_states.UNSUPPORTED_FORMAT,1);
 assert.equal(result.summary.original_page_independently_verified,false);
 assert.equal(result.summary.source_verified_active,false);
 assert.equal(result.summary.public_published,false);
 assert.equal(result.items[0].country_iso3,null);
 assert.equal(result.items[0].source.original_url,null);
 assert.ok(!JSON.stringify(result).includes("India central bank announces"));
 assert.ok(result.checks.every(c=>!Object.hasOwn(c,"url")&&!Object.hasOwn(c,"body")));
});
test("disallowed or invented unverified registry rows fail closed",()=>{
 const row={id:"example",category:"macro",access:"rss",endpoint:"https://public.example.org/feed",
  source_activation_state:"UNVERIFIED_NEW_PUBLIC_ENDPOINT",
  provider_rights_verified:false,commercial_eligible:false,access_verified_in_production:false};
 const mkdoc=r=>({schema:"geomacro.operator-country-source-crosswalk.v1",
  national_primary:[r],global_country_dim:[]});
 assert.equal(privateUnverifiedOsintRegistry(mkdoc(row)).length,1);
 assert.throws(()=>privateUnverifiedOsintRegistry(mkdoc({...row,source_activation_state:"HOLD_TERMS_OR_PAYMENT_REVIEW"})),/UNVERIFIED_OSINT_CANDIDATES_MISSING/);
 assert.throws(()=>privateUnverifiedOsintRegistry(mkdoc({...row,endpoint:"http://127.0.0.1/"})),/UNVERIFIED_OSINT_SOURCE_SCOPE_UNSAFE/);
 assert.throws(()=>privateUnverifiedOsintRegistry(mkdoc({...row,provider_rights_verified:true})),/UNVERIFIED_OSINT_SOURCE_SCOPE_UNSAFE/);
 assert.throws(()=>privateUnverifiedOsintRegistry(mkdoc({...row,endpoint:"https://example.org/feed?token=secret"})),/UNVERIFIED_OSINT_SOURCE_SCOPE_UNSAFE/);
});
