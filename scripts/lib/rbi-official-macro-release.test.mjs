import test from "node:test";
import assert from "node:assert/strict";
import {
 RBI_PRESS_RELEASE_FEEDS,pinnedRbiPressReleaseLink,
 parseRbiMacroPressReference,fetchRbiMacroPressReference,
} from "./rbi-official-macro-release.mjs";
const now=new Date("2026-10-24T11:30:00Z");
const item=(id,title,at="Sat, 24 Oct 2026 11:00:00 GMT",host="www.rbi.org.in")=>
 "<item><title>"+title+"</title><link>https://"+host+
 "/Scripts/BS_PressReleaseDisplay.aspx?prid="+id+
 "</link><pubDate>"+at+"</pubDate></item>";
const rss=body=>'<?xml version="1.0"?><rss version="2.0"><channel>'+
 '<title>Official RBI Press</title>'+body+'</channel></rss>';
test("official RBI RSS pins one exact original document identifier only",()=>{
 assert.deepEqual(RBI_PRESS_RELEASE_FEEDS,[
 "https://rbi.org.in/pressreleases_rss.xml",
 "https://www.rbi.org.in/pressreleases_rss.xml"]);
 assert.equal(pinnedRbiPressReleaseLink(
  "http://rbi.org.in/scripts/bs_pressreleasedisplay.aspx?PRID=65235"),
  "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=65235");
 for(const link of [
  "https://evil.example/Scripts/BS_PressReleaseDisplay.aspx?prid=65235",
  "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=65235&x=1",
  "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=x",
  "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=0",
  "https://www.rbi.org.in/Scripts/rss.aspx",
  "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=65235#fragment",
  "https://www.rbi.org.in.attacker.test/Scripts/BS_PressReleaseDisplay.aspx?prid=65235",
  "file:///Scripts/BS_PressReleaseDisplay.aspx?prid=65235",
 ])assert.equal(pinnedRbiPressReleaseLink(link),null);
});
test("RBI first-party native RSS timestamps only prove a discovery reference, never signed licensed intelligence",()=>{
 const a=parseRbiMacroPressReference(rss(
   item(65235,"Reserve Bank monetary policy and liquidity")+
   item(65235,"Duplicate Reserve Bank monetary policy and liquidity")+
   item(65236,"Maturity of securities","Fri, 23 Oct 2026 09:00:00 GMT")+
   item(65237,"Currency and foreign exchange outlook","Mon, 19 Oct 2026 09:00:00 GMT")+
   item(65238,"Reserve Bank repo rate","Sat, 24 Oct 2026 11:59:00 GMT")+
   item(65239,"Foreign exchange reserves","2026-10-24")),now);
 assert.equal(a.country_iso3,"IND");assert.equal(a.category,"macro");
 assert.equal(a.rss_items_inspected,6);
 assert.equal(a.exact_original_link_ids,5);
 assert.equal(a.current_24h_rss_reference_items,1);
 assert.equal(a.original_page_html_readback_verified,false);
 assert.equal(a.publisher_original_first_published_clock_verified,false);
 assert.equal(a.article_scoped_commercial_rights_verified,false);
 assert.equal(a.independent_event_facts_verified,false);
 assert.equal(a.current_signed_gri_verified,false);
 assert.equal(a.commercial_paid_eligible,false);
 assert.deepEqual([a.b2_requests,a.d1_writes,a.payments],[0,0,0]);
 assert.doesNotMatch(JSON.stringify(a),/65235|rbi\.org\.in|monetary policy/);
});
test("refuses unsafe XML, oversized response and a pretend healthy empty RSS",()=>{
 for(const body of ["<html>signin</html>","<!DOCTYPE rss [<!ENTITY x SYSTEM 'file:///tmp/a'>]><rss/>",
  rss(""),"<rss><item>broken</item></rss>"]){
  assert.throws(()=>parseRbiMacroPressReference(body,now),/RBI_/);
 }
 assert.throws(()=>parseRbiMacroPressReference("x".repeat(384*1024+1),now),/RBI_/);
});
test("one bounded official GET and one allowed same-issuer retry on transient first hop",async()=>{
 const urls=[];
 const x=await fetchRbiMacroPressReference({now,fetchImpl:async(url,opts)=>{
  urls.push(String(url));
  assert.equal(opts.redirect,"error");assert.equal(opts.method,"GET");
  return urls.length===1
   ?new Response("temporarily unavailable",{status:503})
   :new Response(rss(item(65235,"Bank rate and liquidity")));
 }});
 assert.deepEqual(urls,[...RBI_PRESS_RELEASE_FEEDS]);
 assert.equal(x.current_24h_rss_reference_items,1);
});
test("401/403/429 do not bypass publisher refusal with second URL",async()=>{
 for(const status of [401,403,429]){
  let calls=0;
  await assert.rejects(fetchRbiMacroPressReference({now,fetchImpl:async()=>{
   calls++;return new Response("denied",{status});
  }}),/RBI_FEED_(?:ACCESS_DENIED|RATE_LIMITED)/);
  assert.equal(calls,1);
 }
});
test("a failed second official hop stops, no third request, no exception payload leaked",async()=>{
 let count=0;
 await assert.rejects(fetchRbiMacroPressReference({now,fetchImpl:async()=>{
  count++;throw new DOMException("PRIVATE_URI_NO_LOG","TimeoutError");
 }}),/RBI_FEED_TRANSPORT_UNAVAILABLE/);
 assert.equal(count,2);
});
test("XML shape is not optional even after 200 transport",async()=>{
 let calls=0;
 await assert.rejects(fetchRbiMacroPressReference({now,fetchImpl:async()=>{
  calls++;return new Response("<html>200 but not issuer feed</html>");
 }}),/RBI_FEED_SHAPE_INVALID/);
 assert.equal(calls,1);
});
