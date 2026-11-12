import { createHash } from "node:crypto";

export const ICC_NEWS_URL = "https://www.icc-cpi.int/news";
const ICC_HOST = "www.icc-cpi.int";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractTextFragment(value) {
  const input = String(value ?? "");
  let output = "";
  let inTag = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (!inTag && char === "<") {
      inTag = true;
      continue;
    }
    if (inTag) {
      if (char === ">") inTag = false;
      continue;
    }
    output += char;
  }
  return clean(output);
}
function absoluteUrl(href, baseUrl = ICC_NEWS_URL) {
  try { return new URL(href, baseUrl).toString(); } catch { return null; }
}

function dateFromText(value) {
  const m = String(value ?? "").match(/20\d{2}[./-](?:0?[1-9]|1[0-2])[./-](?:0?[1-9]|[12]\d|3[01])/);
  if (!m) return null;
  const normalized = m[0].replace(/[./]/g, "-");
  const parsed = new Date(normalized + "T00:00:00.000Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function attr(tag,name){
 const escaped=name.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&");
 return new RegExp("\\b"+escaped+"\\s*=\\s*(['\"])(.*?)\\1","iu").exec(tag)?.[2]??null;
}
function normalizeNativeDate(raw){
 const value=clean(raw);
 if(/^20\d{2}-\d{2}-\d{2}$/u.test(value)){
  const d=new Date(value+"T00:00:00.000Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?d.toISOString():null;
 }
 if(/^20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/u.test(value)){
  const day=value.slice(0,10),d=new Date(day+"T00:00:00.000Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day?d.toISOString():null;
 }
 if(/(?:Z|[+-]\d{2}:?\d{2}|\bGMT|\bUTC)$/iu.test(value)){
  const d=new Date(value);if(Number.isFinite(d.getTime()))return d.toISOString();
 }
 const months={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
 let match=value.match(/^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(20\d{2})$/iu);
 if(!match)match=value.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})$/iu);
 if(match){
  const day=Number(match[1]??match[2]),month=months[(match[2]??match[1]).toLowerCase()],year=Number(match[3]);
  const iso=year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
  const d=new Date(iso+"T00:00:00.000Z");
  if(Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso)return d.toISOString();
 }
 return null;
}
function nativeDateCandidates(html){
 const candidates=[],keys=[];
 for(const m of String(html).matchAll(/<meta\b[^>]*>/giu)){
  const tag=m[0],key=(attr(tag,"property")??attr(tag,"name")??attr(tag,"itemprop")??"").toLowerCase();
  if(/published|publication|date|modified/iu.test(key)){
   keys.push(key.slice(0,64));
   const value=attr(tag,"content");if(value)candidates.push(value);
  }
 }
 for(const m of String(html).matchAll(/<time\b[^>]*>([\s\S]{0,240}?)<\/time>/giu)){
  const tag=m[0],raw=attr(tag,"datetime");
  keys.push(raw?"time[datetime]":"time[text]");
  candidates.push(raw??extractTextFragment(m[1]));
 }
 for(const m of String(html).matchAll(/"(datePublished|dateCreated|dateModified)"\s*:\s*"([^"]{1,100})"/giu)){
  keys.push("jsonld:"+m[1]);candidates.push(m[2]);
 }
 return {candidates,keys:[...new Set(keys)]};
}
export function inspectIccArticleNativeClock(html){
 const {candidates,keys}=nativeDateCandidates(html);
 const safe=candidates.map(clean).filter(v=>v.length<=80&&/\d/u.test(v)&&/^[0-9A-Za-z ,:+./TZ-]+$/u.test(v));
 return Object.freeze({metadata_keys:keys,date_candidate_values:[...new Set(safe)].slice(0,8)});
}
function nativeDate(html){
 const candidates=nativeDateCandidates(html).candidates;
 for(const m of String(html).matchAll(/<meta\b[^>]*>/giu)){
  const tag=m[0],key=(attr(tag,"property")??attr(tag,"name")??attr(tag,"itemprop")??"").toLowerCase();
  if(["article:published_time","article:published","datepublished","date","dc.date","dcterms.date",
      "dc.date.issued","datecreated","publish_date","pubdate"].includes(key)||
     /published|publication|datecreated|date\.issued/iu.test(key))
   candidates.push(attr(tag,"content"));
 }
 for(const m of String(html).matchAll(/<time\b[^>]*>([\s\S]{0,240}?)<\/time>/giu)){
  const tag=m[0],raw=attr(tag,"datetime");
  if(raw)candidates.push(raw);
  else candidates.push(extractTextFragment(m[1]));
 }
 for(const m of String(html).matchAll(/"(?:datePublished|dateCreated)"\s*:\s*"([^"]{1,100})"/giu))candidates.push(m[1]);
 for(const raw of candidates){const parsed=normalizeNativeDate(raw);if(parsed)return parsed;}
 return null;
}

/** Discover first-party ICC story URLs from its current server-rendered press/news listing. */
export function discoverIccArticleUrls(html,{baseUrl=ICC_NEWS_URL,limit=5}={}){
 const input=String(html??"");
 if(input.length>2*1024*1024)throw Error("ICC_NEWS_LISTING_TOO_LARGE");
 if(!/International Criminal Court|\bICC\b/iu.test(input))
  throw Error("ICC_NEWS_LISTING_MARKER_MISSING");
 if(!Number.isInteger(limit)||limit<1||limit>10)
  throw Error("ICC_NEWS_ARTICLE_LINK_LIMIT_INVALID");
 const links=[],seen=new Set();
 for(const match of input.matchAll(/<a\b[^>]*>/giu)){
  const href=attr(match[0],"href");if(!href)continue;
  const resolved=absoluteUrl(href,baseUrl);if(!resolved)continue;
  let url;try{url=new URL(resolved)}catch{continue}
  if(url.protocol!=="https:"||url.hostname!==ICC_HOST||url.port||url.username||
     url.password||url.search||url.hash||
     !/^\/news\/[a-z0-9][a-z0-9-]{2,160}(?:\/[a-z0-9][a-z0-9-]{2,160}){0,3}\/?$/iu.test(url.pathname)||
     /\/(?:subscribe|rss|search|filter)(?:\/|$)/iu.test(url.pathname))continue;
  const canonicalHref=url.href;if(seen.has(canonicalHref))continue;
  seen.add(canonicalHref);links.push(canonicalHref);if(links.length>=limit)break;
 }
 return Object.freeze(links);
}

/** Parse only an ICC article page's original issuer metadata; no RSS/fetch clock fallback. */
export function parseIccArticleHtml(html,{url,retrievedAt=new Date().toISOString()}={}){
 const input=String(html??"");
 let article;
 try{article=new URL(url)}catch{throw Error("ICC_ARTICLE_URL_INVALID")}
 if(article.protocol!=="https:"||article.hostname!==ICC_HOST||article.port||
    (!/^\/news\/[a-z0-9][a-z0-9-]{2,160}(?:\/[a-z0-9][a-z0-9-]{2,160}){0,3}\/?$/iu.test(article.pathname)&&
     !/^\/node\/[1-9][0-9]{2,8}\/?$/u.test(article.pathname)))
  throw Error("ICC_ARTICLE_URL_NOT_FIRST_PARTY");
 if(!/International Criminal Court|\bICC\b/iu.test(input))throw Error("ICC_ARTICLE_MARKER_MISSING");
 const title=attr(/<meta\b[^>]*(?:property=["']og:title["'][^>]*)>/iu.exec(input)?.[0]??"","content")||
   extractTextFragment(/<title\b[^>]*>([\s\S]{1,500}?)<\/title>/iu.exec(input)?.[1]??"");
 const publishedAt=nativeDate(input);
 if(title.length<8||!publishedAt)throw Error(title.length<8?"ICC_ARTICLE_TITLE_MISSING":"ICC_NATIVE_PUBLICATION_TIME_MISSING");
 const canonical=/<link\b[^>]*rel=["']canonical["'][^>]*>/iu.exec(input)?.[0];
 if(canonical){const href=absoluteUrl(attr(canonical,"href"),url);let c;try{c=new URL(href)}catch{}
  if(!c||c.hostname!==ICC_HOST||c.pathname!==article.pathname)throw Error("ICC_ARTICLE_CANONICAL_MISMATCH");}
 return normalizeIccNews({id:article.pathname.split("/").filter(Boolean).at(-1),title,publishedAt,url:article.href,retrievedAt,
  summary:"ICC first-party article metadata verified.",raw:{source:"ICC_ARTICLE_NATIVE_METADATA",url:article.href,publishedAt}});
}

export function parseIccNewsHtml(html, { retrievedAt = new Date().toISOString(), baseUrl = ICC_NEWS_URL } = {}) {
  const input = String(html ?? "");
  if (!/\bNews\b/i.test(input) || !/International Criminal Court|ICC/i.test(input)) {
    throw new Error("ICC news page marker not found");
  }

  const records = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']*\/news\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of input.matchAll(anchorRe)) {
    const title = extractTextFragment(match[2]);
    const url = absoluteUrl(match[1], baseUrl);
    if (!url || title.length < 8) continue;
    const context = extractTextFragment(input.slice(Math.max(0, match.index - 450), Math.min(input.length, match.index + match[0].length + 450)));
    const publishedAt = dateFromText(context);
    const id = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? encodeURIComponent(url).slice(-80);
    records.push(normalizeIccNews({
      id,
      title,
      publishedAt,
      url,
      retrievedAt,
      raw: { title, publishedAt, url, context }
    }));
  }

  const unique = [...new Map(records.map((record) => [record.source_record_id, record])).values()];
  if (!unique.length) throw new Error("ICC parser found no news records");
  return unique;
}

export function normalizeIccNews({ id, title, publishedAt = null, url = ICC_NEWS_URL, summary = "", retrievedAt = new Date().toISOString(), raw = null }) {
  if (!id || !title) throw new Error("Invalid ICC news observation");
  const rawPayload = raw ?? { id, title, publishedAt, url, summary };
  const published = publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? new Date(publishedAt).toISOString() : null;
  return {
    source_id: "icc_news",
    source_record_id: "ICC:" + clean(id).replace(/\s+/g, "_"),
    category: "GEOPOLITICS",
    country_iso3: null,
    observed_at: retrievedAt,
    published_at: published,
    title: clean(title),
    summary: clean(summary) || "ICC official news item.",
    source_url: url,
    metric: "official_news_event",
    value_numeric: 1,
    value_text: "PUBLISHED",
    unit: "news_item",
    event_type: "INTERNATIONAL_JUSTICE_EVENT",
    signal_type: "EXTERNAL_GEOPOLITICAL_EVENT",
    provenance: { provider: "International Criminal Court", dataset: "Official News", record_id: clean(id) },
    raw_payload: rawPayload,
    raw_hash: createHash("sha256").update(JSON.stringify(rawPayload)).digest("hex")
  };
}
