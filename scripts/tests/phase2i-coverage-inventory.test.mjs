import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCountries,gatherSources,loadCatalogues,buildLedger,parseFeed,
 probeSource,probeRotation} from "../ops/phase2i-coverage-inventory.mjs";
const countries=parseCountries(readFileSync("src/lib/canonical-country-registry-195.ts","utf8"));
const sources=gatherSources(countries,loadCatalogues());
const fixed=new Date("2026-10-30T09:00:00Z");
test("canonical UN193+2 registry retains 195 unique routing countries, exactly 585 domain cells",()=>{
 assert.equal(countries.length,195);assert.ok(countries.some(x=>x.iso3==="VAT"));
 assert.ok(countries.some(x=>x.iso3==="PSE"));
 const x=buildLedger(countries,sources,{},[],fixed);
 assert.equal(x.cell_count,585);assert.equal(x.cells.length,585);
 assert.equal(x.per_category.geopolitics.cells,195);
 assert.equal(x.per_category.macro.cells,195);
 assert.equal(x.per_category.rare_earth.cells,195);
 assert.equal(x.complete_live_585_country_event_coverage_verified,false);
 assert.equal(x.cells.every(c=>c.country_event_verified===false&&
  c.commercially_distributable_derived_records===null&&
  c.publisher_country_does_not_prove_event_country===true),true);
 assert.equal(x.cells.filter(c=>c.registered_source_ids.length===0).length>0,true);
 assert.equal(x.registered_source_count,sources.length);
});
test("preflight HTTP 200 without a source timestamp cannot become current WORKING",()=>{
 const x=buildLedger(countries,sources,{},[],fixed);
 for(const cell of x.cells){
  assert.equal(cell.last_actual_successful_http_fetch_at,null);
  assert.equal(cell.last_source_native_publication_at,null);
  assert.equal(cell.source_status,"NOT_YET_VERIFIED");
 }
 assert.ok(sources.some(s=>s.legacy_preflight_200));
});
test("non-English item publication preserved; RSS pubDate and Atom published only",()=>{
 const rss='<rss version="2.0"><channel><item><title>মুদ্রাস্ফীতি বৃদ্ধি</title><pubDate>Fri, 30 Oct 2026 08:10:00 GMT</pubDate></item></channel></rss>';
 const p=parseFeed(rss,"rss",fixed);
 assert.equal(p.ok,true);assert.equal(p.recent_native_dated_items,1);
 assert.equal(p.last_source_native_publication_time,"Fri, 30 Oct 2026 08:10:00 GMT");
 assert.equal(p.last_source_native_publication_at,"2026-10-30T08:10:00.000Z");
 assert.equal(parseFeed('<feed><entry><updated>2026-10-30T08:00:00Z</updated></entry></feed>',"atom",fixed).native_dated_items,0);
 assert.equal(parseFeed('<!DOCTYPE html><rss></rss>',"rss",fixed).ok,false);
});
test("real-shaped bounded HTTP-200 is a transport proof, not event country or rights",async()=>{
 const s=sources.find(x=>x.publisher_country_iso3==="AUS"&&["rss","rdf"].includes(x.format));
 assert.ok(s);
 const out=await probeSource(s,{now:fixed,fetchImpl:async(url,opts)=>{
  assert.equal(url,s.url);assert.equal(opts.redirect,"error");
  return new Response('<rss><channel><item><title>全国金融报告</title><pubDate>Fri, 30 Oct 2026 08:10:00 GMT</pubDate></item></channel></rss>',{status:200});
 }});
 assert.equal(out.status,"WORKING");assert.equal(out.country_event_verified,false);
 assert.equal(out.commercial_rights_verified,false);
 const ledger=buildLedger(countries,sources,{},[out],fixed);
 const cell=ledger.cells.find(x=>x.country_iso3==="AUS"&&x.category===s.categories[0]);
 assert.equal(cell.source_status,"WORKING");
 assert.equal(cell.country_event_verified,false);
 assert.equal(cell.actual_country_attributed_news_candidates,null);
 assert.equal(cell.last_actual_successful_http_fetch_at,fixed.toISOString());
 const next=buildLedger(countries,sources,ledger,[],new Date(fixed.getTime()+3600000));
 assert.equal(next.cells.find(x=>x.country_iso3==="AUS"&&x.category===s.categories[0]).source_status,"WORKING");
});
test("403, 429, invalid feed and unsupported HTML never count as working",async()=>{
 const s={source_id:"official_test",url:"https://example.org/feed",format:"rss"};
 const status=async(n)=>probeSource(s,{now:fixed,fetchImpl:async()=>new Response("",{status:n})});
 assert.equal((await status(403)).status,"SOURCE_UNAVAILABLE");
 assert.equal((await status(429)).status,"QUOTA_HELD");
 assert.equal((await probeSource(s,{now:fixed,fetchImpl:async()=>new Response("<html>login</html>",{status:200})})).status,"UNSUPPORTED_FORMAT");
 assert.equal((await probeSource({...s,format:"html"},{now:fixed})).status,"UNSUPPORTED_FORMAT");
});
test("fixed 18-per-slot probe never follows user URLs, no retries or concurrent bursts",async()=>{
 let requests=0;
 const options=sources.filter(s=>["rss","rdf","atom","xml"].includes(s.format));
 const proof=await probeRotation(options,fixed,async()=>{requests++;return new Response("denied",{status:403});},18);
 assert.equal(requests,18);assert.equal(proof.length,18);
 assert.ok(proof.every(x=>x.status==="SOURCE_UNAVAILABLE"));
 await assert.rejects(probeRotation(options,fixed,fetch,25),/PHASE2I_BOUNDED_REQUEST_CAP/u);
});
