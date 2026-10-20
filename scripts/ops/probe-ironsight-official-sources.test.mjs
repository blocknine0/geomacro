import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {IRONSIGHT_OFFICIAL_DISCOVERY_SOURCES,probeIronsightOfficialSources}
 from "./probe-ironsight-official-sources.mjs";

const NOW=Date.parse("2026-10-20T19:30:00Z");
const mime={"Content-Type":"application/rss+xml"};
const rss='<?xml version="1.0"?><rss><channel><item><title>Secret synthetic upstream text</title><link>https://www.centcom.mil/fake</link><pubDate>Tue, 20 Oct 2026 19:01:00 GMT</pubDate></item></channel></rss>';
const probe=fetchImpl=>probeIronsightOfficialSources({now:NOW,fetchImpl});
test("only two fixed official issuer domains; no Telegram sources",()=>{
 assert.equal(IRONSIGHT_OFFICIAL_DISCOVERY_SOURCES.length,2);
 assert.deepEqual(IRONSIGHT_OFFICIAL_DISCOVERY_SOURCES.map(s=>new URL(s.url).hostname),["www.centcom.mil","www.defense.gov"]);
 assert.ok(IRONSIGHT_OFFICIAL_DISCOVERY_SOURCES.every(s=>s.category==="geopolitics"&&s.upstream_code_source==="NoblerWorks-HQ/IRONSIGHT"));
});
test("valid XML transport is NOT a rights or qualified news event, and never leaks raw bytes",async()=>{
 const urls=[],opts=[];
 const result=await probe(async (url,options)=>{urls.push(url);opts.push(options);
  return new Response(rss,{status:200,headers:mime})});
 assert.deepEqual(urls,IRONSIGHT_OFFICIAL_DISCOVERY_SOURCES.map(x=>x.url));
 assert.ok(opts.every(x=>x.redirect==="manual"&&x.method==="GET"&&x.cache==="no-store"));
 assert.ok(result.rows.every(x=>x.xml_envelope_verified&&x.native_date_present));
 assert.ok(result.rows.every(x=>x.production_ingest_enabled===false));
 for(const k of ["qualifying_paid_intelligence","commercial_use_granted","telegram_scraping_enabled","original_news_verified","payment_attempted","storage_mutated"])
  assert.equal(result[k],false);
 const receipt=JSON.stringify(result);
 for(const secret of ["Secret synthetic","www.centcom.mil/fake","pubDate","<rss","https://"])
  assert.ok(!receipt.includes(secret),secret);
});
test("403, 429, redirect are never retried or bypassed",async()=>{
 for(const [status,code] of [[403,"PUBLISHER_FORBIDDEN_NO_BYPASS"],[429,"RATE_LIMITED_NO_RETRY"],[302,"REDIRECT_NOT_FOLLOWED"]]){
  let calls=0;
  const result=await probe(async()=>{calls++;return new Response(null,{
   status,headers:status===302?{Location:"https://evil.invalid/private"}:{}})});
  assert.equal(calls,2);
  assert.ok(result.rows.every(x=>x.transport_state===code&&x.http_status===status));
  assert.equal(JSON.stringify(result).includes("evil.invalid"),false);
 }
});
test("rejects HTML, empty RSS, DTD, excessive body and network errors",async()=>{
 for(const [body,headers,expected] of [
  ["<html>blocked</html>",{"Content-Type":"text/html"},"NOT_XML_MEDIA_TYPE"],
  ["<rss><channel></channel></rss>",mime,"UNQUALIFIED_XML_ENVELOPE"],
  ['<!DOCTYPE rss><rss><item>test</item></rss>',mime,"UNQUALIFIED_XML_ENVELOPE"],
  ["A".repeat(192001),mime,"NETWORK_OR_BOUND_EXCEEDED"],
 ]){
  const r=await probe(async()=>new Response(body,{status:200,headers}));
  assert.ok(r.rows.every(x=>x.transport_state===expected),expected);
 }
 const failure=await probe(async()=>{throw Error("Sensitive upstream exception");});
 assert.ok(failure.rows.every(x=>x.transport_state==="NETWORK_OR_BOUND_EXCEEDED"));
 assert.ok(!JSON.stringify(failure).includes("Sensitive upstream"));
});
test("does not invent publication clock from Atom updated",async()=>{
 const updated="<feed><entry><updated>2026-10-20T19:00:00Z</updated></entry></feed>";
 const r=await probe(async()=>new Response(updated,{headers:{"Content-Type":"application/atom+xml"}}));
 assert.ok(r.rows.every(x=>x.xml_envelope_verified&&!x.native_date_present));
});
test("invalid timeout or date refuses BEFORE fetch",async()=>{
 let called=false;
 for(const o of [{timeout:300},{timeout:16000},{now:NaN}]){
  await assert.rejects(()=>probeIronsightOfficialSources({...o,fetchImpl:async()=>{called=true}}),
   /IRONSIGHT_DIAGNOSTIC_BUDGET_INVALID/);
 }
 assert.equal(called,false);
});
test("no IRONSIGHT unofficial scraper copied or production Telegram secrets in workflow",()=>{
 const source=readFileSync("scripts/ops/probe-ironsight-official-sources.mjs","utf8");
 const workflow=readFileSync(".github/workflows/ironsight-official-research-probe.yml","utf8");
 assert.ok(!source.includes("findLatestPostId"));
 assert.ok(!source.includes("translateFreeText"));
 assert.ok(!source.includes("https://t.me/"));
 assert.match(workflow,/permissions:\s*\n\s*contents: read/u);
 assert.match(workflow,/node --test scripts\/ops\/probe-ironsight-official-sources\.test\.mjs/u);
 assert.match(workflow,/node scripts\/ops\/probe-ironsight-official-sources\.mjs/u);
 assert.doesNotMatch(workflow,/secrets\.|TELEGRAM_SESSION|SUPABASE_|COINBASE_|B2_APPLICATION_KEY/u);
});
