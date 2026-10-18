#!/usr/bin/env node
// Exact pinned EIA official RSS, anonymous read-only LINK PATH census.
// This is transport/original article identity diagnostics only: it never
// reads full articles, logs URLs/titles/text, verifies commercial rights,
// scores a GRI or makes any B2, D1, Supabase or payment request.
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const FEED="https://www.eia.gov/rss/press_rss.xml";
const MAX=384*1024;
const PRESS=/^\/pressroom\/releases\/press[1-9][0-9]{1,5}\.php$/u;
function extract(chunk,tag) {
  const m=new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]{1,1000}?)<\\/"+tag+">","iu").exec(chunk);
  return m?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/gu,"").replace(/&amp;/gu,"&").trim()??"";
}
export function classifyEiaLink(raw){
  if(typeof raw!=="string"||raw.length>800)return "bad";
  try{
    const u=new URL(raw);
    if(u.username||u.password||u.port||u.hash||u.hostname!=="www.eia.gov")return "foreign_or_unsafe";
    if(u.protocol==="https:"&&PRESS.test(u.pathname)&&!u.search)return "https_exact_press";
    if(u.protocol==="http:"&&PRESS.test(u.pathname)&&!u.search)return "http_exact_press";
    if(PRESS.test(u.pathname)&&u.search)return "query_press";
    if(u.pathname.startsWith("/pressroom/"))return "other_pressroom";
    return "other_eia";
  }catch{return "bad"}
}
export async function probeEiaPressRss({
  fetchImpl=fetch,
}={}){
  const res=await fetchImpl(FEED,{
    method:"GET",redirect:"error",
    headers:{accept:"application/rss+xml, application/xml, text/xml"},
    signal:AbortSignal.timeout(12000),
  });
  if(!res||res.status!==200||res.redirected)return {ok:false,reason:"EIA_FEED_HTTP_REJECTED"};
  const mime=res.headers?.get("content-type")??"";
  if(!/^(?:text\/xml|application\/(?:xml|rss\+xml))(?:;|$)/iu.test(mime))
    return {ok:false,reason:"EIA_FEED_MIME_REJECTED"};
  const content=await res.text();
  if(content.length>MAX||!/^\s*<\?xml|<rss(?:\s|>)/iu.test(content)||/<!DOCTYPE|<!ENTITY/iu.test(content))
    return {ok:false,reason:"EIA_FEED_XML_REJECTED"};
  const rows=[...content.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0,24);
  const types={https_exact_press:0,http_exact_press:0,query_press:0,other_pressroom:0,other_eia:0,foreign_or_unsafe:0,bad:0};
  const tags={link_element_present:0,link_empty:0,link_https:0,link_http:0,
    link_relative:0,link_other_nonempty:0,guid_tag_present:0,
    guid_marked_permalink_true:0,guid_https:0,guid_http:0,guid_other:0,
    guid_exact_press:0,encoded_link_cdata:0,raw_link_attribute:0};
  for(const m of rows){
    const xml=m[1], link=extract(xml,"link"),guid=extract(xml,"guid");
    types[classifyEiaLink(link)]++;
    if(/<link(?:\\s|>)/iu.test(xml))tags.link_element_present++;
    if(!link)tags.link_empty++;
    else if(link.startsWith("https://"))tags.link_https++;
    else if(link.startsWith("http://"))tags.link_http++;
    else if(link.startsWith("/"))tags.link_relative++;
    else tags.link_other_nonempty++;
    if(/<guid(?:\\s|>)/iu.test(xml))tags.guid_tag_present++;
    if(/<guid\\b[^>]*isPermaLink=["']true["']/iu.test(xml))tags.guid_marked_permalink_true++;
    if(guid.startsWith("https://"))tags.guid_https++;
    else if(guid.startsWith("http://"))tags.guid_http++;
    else if(guid)tags.guid_other++;
    if(["https_exact_press","http_exact_press"].includes(classifyEiaLink(guid)))
      tags.guid_exact_press++;
    if(/<link>\\s*<!\\[CDATA\\[/iu.test(xml))tags.encoded_link_cdata++;
    if(/<link\\s+[^>]*href=/iu.test(xml))tags.raw_link_attribute++;
  }
  return {schema:"geomacro.eia-native-original-rss-shape.v1",
    ok:true,item_count:rows.length,link_class_counts:types,tag_shape_counts:tags,
    original_path_confirmed:types.https_exact_press+types.http_exact_press>0,
    commercial_approved:false,source_native_current_verified:false,
    score_generated:false,source_urls_exposed:false,raw_material_exposed:false,
    b2_requests:0,d1_writes:0,supabase_writes:0,payments:0};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const report=await probeEiaPressRss();
    console.log(JSON.stringify(report));
    if(!report.ok||!report.original_path_confirmed)process.exitCode=3;
  }catch{
    console.error("EIA_NATIVE_RSS_TRANSPORT_OR_SHAPE_FAILED");
    process.exitCode=3;
  }
}
