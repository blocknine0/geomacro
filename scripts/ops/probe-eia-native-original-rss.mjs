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
  for(const m of rows)types[classifyEiaLink(extract(m[1],"link"))]++;
  return {schema:"geomacro.eia-native-original-rss-shape.v1",
    ok:true,item_count:rows.length,link_class_counts:types,
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
