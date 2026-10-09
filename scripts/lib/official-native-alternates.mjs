// Original-publisher second-family news/Atom discovery when the primary feed
// has no dated, topical events. These are PRIVATE, NOT rights-certified sources.
// Feed updated/index/retrieval time never substitutes for per-entry publication.
export const ORIGINAL_PUBLISHER_ALTERNATES = Object.freeze({
  geopolitics: Object.freeze({
    url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml",
    format: "rss",
    articleHosts: Object.freeze(["news.un.org"]),
    topics: /\b(?:ceasefire|sanctions?|military|war|conflict|security council|airstrike|border|invasion|attack|peace talks|displacement|humanitarian crisis|peacekeeping|armed group|refugees?)\b/iu,
  }),
  macro: Object.freeze({
    url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/18-eng.atom",
    format: "atom",
    articleHosts: Object.freeze(["www150.statcan.gc.ca"]),
    topics: /\b(?:inflation|consumer prices?|producer prices?|price indices?|price index|cost of living|exchange rate|interest rates?|currency|prices?)\b/iu,
  }),
  rare_earth: Object.freeze({
    url: "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=atom&atomtitle=Natural%20Resources%20Canada",
    format: "atom",
    articleHosts: Object.freeze(["www.canada.ca", "canada.ca", "natural-resources.canada.ca"]),
    topics: /\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|gallium|germanium|neodymium|dysprosium|terbium|strategic minerals?|mineral (?:supply|production|reserve|trade|deposit|resource|assessment)|mining|mine supply|minerals? sector)\b/iu,
  }),
});
const MAX_FEED_BYTES = 384 * 1024;
const MAX_ITEMS = 100;
const DAY_MS = 86_400_000;
const XML_TYPE = /^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/iu;
const unescape = (x) => String(x ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1")
  .replace(/&(?:amp|lt|gt|quot|apos|#(\d+)|#x([\da-f]+));/giu, (v,d,h) => {
    const chars = { "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'" };
    if (Object.hasOwn(chars,v.toLowerCase())) return chars[v.toLowerCase()];
    const code = d ? Number(d) : Number.parseInt(h,16);
    return Number.isInteger(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : "";
  }).replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();

function tag(block, name) {
  const m = block.match(new RegExp(`<(?:atom:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:atom:)?${name}>`,"iu"));
  return m ? unescape(m[1]) : "";
}

function officialUrl(value, hosts) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || !hosts.includes(u.hostname.toLowerCase()) ||
        u.href.length > 2048) return null;
    return u;
  } catch { return null; }
}

function atomOriginalLink(xmlEntry) {
  const candidates = [...xmlEntry.matchAll(/<(?:atom:)?link\b([^>]*?)\/?\s*>/giu)];
  for (const item of candidates) {
    const attrs = item[1];
    const rel = attrs.match(/\brel\s*=\s*["']([^"']+)["']/iu)?.[1] ?? "alternate";
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1];
    if ((rel === "alternate" || rel === "canonical") && href) return unescape(href);
  }
  return "";
}

export function parseOfficialAlternate(xml, category, now = new Date(), diagnostics = null) {
  const config = ORIGINAL_PUBLISHER_ALTERNATES[category];
  if (!config || typeof xml !== "string" || xml.length > MAX_FEED_BYTES ||
      /<!DOCTYPE|<!ENTITY/iu.test(xml) ||
      (config.format === "rss" && !xml.includes("<rss")) ||
      (config.format === "atom" && !/<(?:atom:)?feed(?:\s|>)/iu.test(xml))) {
    throw new Error("OFFICIAL_ALTERNATE_DOCUMENT_INVALID");
  }
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("OFFICIAL_ALTERNATE_CLOCK_INVALID");
  const entries = [...xml.matchAll(config.format === "rss"
    ? /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu
    : /<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu)].slice(0,MAX_ITEMS);
  const stats = {
    alternate_feed_items_seen: entries.length,
    alternate_native_date_items: 0,
    alternate_native_current_items: 0,
    alternate_host_match_items: 0,
    alternate_topic_match_items: 0,
    alternate_admitted_private_count: 0,
    // Aggregate tag-shape counters only; no raw article text, URLs or dates.
    // Diagnose vendor Atom format without laundering <updated> as <published>.
    alternate_atom_published_tag_items: 0,
    alternate_atom_updated_only_items: 0,
    alternate_atom_dc_date_tag_items: 0,
    alternate_atom_dcterms_issued_tag_items: 0,
    alternate_atom_link_href_items: 0,
  };
  const out=[];
  const seen=new Set();
  for (const [,block] of entries) {
    const title=tag(block,"title");
    const publishedTag=config.format === "atom" ? tag(block,"published") : "";
    if (config.format === "atom") {
      if (publishedTag) stats.alternate_atom_published_tag_items++;
      else if (tag(block,"updated")) stats.alternate_atom_updated_only_items++;
      if (tag(block,"dc:date")) stats.alternate_atom_dc_date_tag_items++;
      if (tag(block,"dcterms:issued")) stats.alternate_atom_dcterms_issued_tag_items++;
    }
    const dateText=config.format === "rss" ? tag(block,"pubDate") : publishedTag;
    const time=Date.parse(dateText);
    const raw=config.format === "rss" ? tag(block,"link") : atomOriginalLink(block);
    if (config.format === "atom" && raw) stats.alternate_atom_link_href_items++;
    const uri=officialUrl(raw,config.articleHosts);
    if (Number.isFinite(time)) stats.alternate_native_date_items++;
    // Strict original time: reject any source timestamp later than our clock.
    const dated=Number.isFinite(time) && time <= nowMs && nowMs-time<=DAY_MS;
    if (dated) stats.alternate_native_current_items++;
    if (uri) stats.alternate_host_match_items++;
    if (config.topics.test(title)) stats.alternate_topic_match_items++;
    if (!dated || !uri || !config.topics.test(title) ||
        title.length < 16 || title.length > 500 || seen.has(uri.href)) continue;
    seen.add(uri.href);
    stats.alternate_admitted_private_count++;
    out.push({
      title, description:"", url:uri.href, publishedAt:new Date(time).toISOString(),
      source:uri.hostname, sourceDomain:uri.hostname,
      discoveryProvider:"official_native_rss", nativePublishedAtVerified:true,
      nativeTimeEvidence:config.format === "atom" ? "publisher_atom_entry_published" : "publisher_rss_item_pubDate",
      privateOnly:true, rightsVerified:false, commercialEligible:false,
    });
  }
  if (diagnostics && typeof diagnostics==="object" && !Array.isArray(diagnostics)) Object.assign(diagnostics,stats);
  return out.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
}

export async function fetchOriginalAlternate(category, { now=new Date(), fetchImpl=fetch, diagnostics=null }={}) {
  const cfg=ORIGINAL_PUBLISHER_ALTERNATES[category];
  if (!cfg) throw new Error("OFFICIAL_ALTERNATE_CATEGORY_INVALID");
  const res=await fetchImpl(cfg.url,{
    redirect:"error", signal:AbortSignal.timeout(10_000),
    headers:{ accept:"application/atom+xml, application/rss+xml;q=0.9, application/xml;q=0.8",
      "user-agent":"Geomacro-Original-Feed-Private-Discovery/1.0" },
  });
  const ct=res.headers.get("content-type")??"";
  if(!res.ok || !XML_TYPE.test(ct)) throw new Error("OFFICIAL_ALTERNATE_TRANSPORT_INVALID");
  if(Number(res.headers.get("content-length")||0)>MAX_FEED_BYTES ||
     !res.body) throw new Error("OFFICIAL_ALTERNATE_BODY_INVALID");
  const reader=res.body.getReader(), chunks=[];
  let bytes=0;
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done) break;
      bytes+=value.byteLength;
      if(bytes>MAX_FEED_BYTES) throw new Error("OFFICIAL_ALTERNATE_TOO_LARGE");
      chunks.push(value);
    }
  } finally {reader.releaseLock()}
  return parseOfficialAlternate(new TextDecoder("utf-8",{fatal:true}).decode(
    Buffer.concat(chunks.map(x=>Buffer.from(x)))), category, now, diagnostics);
}
