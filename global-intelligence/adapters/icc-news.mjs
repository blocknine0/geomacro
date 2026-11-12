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
function nativeDate(html){
 const candidates=[];
 for(const m of String(html).matchAll(/<meta\b[^>]*>/giu)){
  const tag=m[0],key=(attr(tag,"property")??attr(tag,"name")??"").toLowerCase();
  if(["article:published_time","datepublished","date"].includes(key))candidates.push(attr(tag,"content"));
 }
 for(const m of String(html).matchAll(/<time\b[^>]*>/giu)){
  const tag=m[0],raw=attr(tag,"datetime");
  if(raw)candidates.push(raw);
 }
 for(const m of String(html).matchAll(/"datePublished"\s*:\s*"([^"]{1,80})"/giu))candidates.push(m[1]);
 for(const raw of candidates){
  if(!raw||!/(?:Z|[+-]\d{2}:?\d{2})$/iu.test(raw))continue;
  const d=new Date(raw);if(Number.isFinite(d.getTime()))return d.toISOString();
 }
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
