/**
 * First-party original-feed discovery BEFORE original publication can be
 * established. Never call these records "fresh news", a verified event, or
 * saleable GRO. Atom updated is NOT publication time.
 *
 * The unresolved StatCan/NRCan/GOV feeds expose many linkable entries with no
 * <published>. Strict article-path verification is still required before a
 * page fetch or signed intelligence. This cheap lane observes only their
 * immutable SHA identities so 30-minute changes are no longer invisible.
 */
import {createHash} from "node:crypto";
import {classifyPrivateFirstPartyTitle} from "./private-first-party-title-triage.mjs";
const digest=(s)=>createHash("sha256").update(s,"utf8").digest("hex");
const MAX_ITEMS=64,MAX_BYTES=192*1024,MAX_URL=1800;
const ALLOWED=new Set([
  "statcan_prices_original_atom_review",
  "nrcan_government_news_original_atom_review",
  "uk_fcdo_original_foreign_policy_atom_review",
  "uk_dbt_critical_minerals_atom_pending_review",
]);
const DOMAINS=new Set(["geopolitics","macro","rare_earth"]);
function firstPartySource(source) {
  return source && ALLOWED.has(source.id) &&
    DOMAINS.has(source.domain) && source.media==="atom" &&
    Array.isArray(source.original_hosts) && source.original_hosts.length>0 &&
    source.original_hosts.every(s=>typeof s==="string"&&s.length<120);
}
function candidateUrl(value,source) {
  if(typeof value!=="string"||value.length<12||value.length>MAX_URL)return null;
  let u;
  try{u=new URL(value.replace(/&amp;/giu,"&"))}catch{return null}
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
     !source.original_hosts.includes(u.hostname)||
     !/^\/(?!\/)/u.test(u.pathname)||u.pathname.length<5||
     /\.(?:rss|atom|xml)(?:$|\/)/iu.test(u.pathname))return null;
  // This is identity ONLY, not approval to fetch an arbitrary same-host path.
  // Reject unneeded marketing parameters for a stable cross-poll SHA.
  for(const key of [...u.searchParams.keys()])
    if(/^utm_|^(?:fbclid|gclid|mc_cid|mc_eid)$/iu.test(key))
      u.searchParams.delete(key);
  u.searchParams.sort();
  return u.href;
}
const TITLE_ENTITIES=Object.freeze({
  amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",ndash:"-",mdash:"-",
  lsquo:"'",rsquo:"'",ldquo:'"',rdquo:'"',hellip:"...",bull:"*",
  copy:"(c)",reg:"(r)",trade:"(tm)",euro:"EUR",pound:"GBP",yen:"JPY",
  deg:" degrees ",plusmn:"+/-",times:"x",divide:"/",sect:"section ",
});
function decodeTitleEntities(value) {
  return value.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,20});/giu,
    (whole,entity) => {
      if(entity[0]==="#"){
        const hex=entity[1]?.toLowerCase()==="x";
        const code=Number.parseInt(entity.slice(hex?2:1),hex?16:10);
        if(!Number.isInteger(code)||code<=0||code>0x10ffff||
           (code>=0xd800&&code<=0xdfff))return " ";
        return String.fromCodePoint(code);
      }
      const key=entity.toLowerCase();
      return Object.hasOwn(TITLE_ENTITIES,key)?TITLE_ENTITIES[key]:whole;
    });
}
function privateParsedTitle(item) {
  const match=item.match(/<(?:atom:)?title\b([^>]*)>([\s\S]*?)<\/(?:atom:)?title>/iu);
  const raw=match?.[2];
  if(!match||!raw||raw.length>900)return null;
  const type=match[1].match(/\btype\s*=\s*["']([^"']+)["']/iu)?.[1]?.toLowerCase()??"text";
  // Atom text is XML-decoded once. Atom HTML is decoded once as XML and once
  // as HTML, then reduced to harmless visible text. Never render or retain
  // markup, attributes, scriptable content, or the title itself in D1/logs.
  if(type!=="text"&&type!=="html")return null;
  let value=raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu,"$1");
  value=decodeTitleEntities(value);
  if(type==="html"){
    value=decodeTitleEntities(value);
    value=value.replace(/<\/?(?:b|strong|i|em|u|span|small|sup|sub|br|p|div|ul|ol|li)\s*\/?>/giu," ");
  }
  value=value.replace(/\s+/gu," ").trim();
  // Remaining angle brackets mean unsupported/malformed markup. Reject it
  // rather than attempt to recover visible text from an arbitrary structure.
  if(value.length<8||value.length>300||/[<>]|\p{Cc}/u.test(value))return null;
  return {hash:digest(value.toLowerCase().normalize("NFKC")),ephemeral:value};
}
export function observeUndatedFirstPartyAtomFeed(xml,source,{now=new Date()}={}) {
  if(!firstPartySource(source)||!(now instanceof Date)||
     !Number.isFinite(now.getTime())||
     typeof xml!=="string"||Buffer.byteLength(xml,"utf8")>MAX_BYTES||
     /<!DOCTYPE|<!ENTITY/iu.test(xml)||!/<(?:atom:)?feed(?:\s|>)/iu.test(xml))
    throw Error("UNDATED_FIRST_PARTY_OBSERVATION_INVALID");
  const records=[],seen=new Set(),entries=[...xml.matchAll(
    /<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu,
  )].slice(0,MAX_ITEMS);
  for(const [,item] of entries) {
    // Native published values (even invalid/future) belong only to the
    // existing strict original-publication pipeline, not this lane.
    if(/<(?:atom:)?published(?:\s[^>]*)?>/iu.test(item))continue;
    // A source can encode a title as HTML or use an unfamiliar Atom title
    // type. Title readability is NOT a discovery admission requirement.
    const title=privateParsedTitle(item);
    const triage=classifyPrivateFirstPartyTitle(title?.ephemeral??null,source.domain);
    let identity=null,identityKind=null;
    for(const link of item.matchAll(/<(?:atom:)?link\b([^>]*?)\/?\s*>/giu)) {
      const attrs=link[1];
      const rel=attrs.match(/\brel\s*=\s*["']([^"']+)["']/iu)?.[1]??"alternate";
      if(!["alternate","canonical"].includes(rel))continue;
      const href=attrs.match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1];
      identity=candidateUrl(href,source);
      if(!identity)continue;
      identityKind="FIRST_PARTY_LINK";
      break;
    }
    if(!identity){
      // Atom requires a stable entry <id>. It is an opaque identifier from
      // a transport-validated FIRST-PARTY feed, NOT a fetchable article URL.
      // E.g. StatCan feed links may be non-article publication/catalogue paths.
      // This fallback is never allowed into verified current GRO delivery.
      const raw=item.match(/<(?:atom:)?id(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?id>/iu)?.[1]?.trim();
      if(typeof raw==="string"&&raw.length>=8&&raw.length<=768&&
         !/<[^>]*>|\p{Cc}/u.test(raw)){
        identity=source.id+"|atom-id|"+raw;
        identityKind="OFFICIAL_ATOM_ENTRY_ID";
      }
    }
    if(!identity){
      // Final *observation-only* fallback for a fully validated fixed first-
      // party feed with a non-standard Atom title or no permitted article
      // URL. Hash a bounded normalized entry with changing <updated> removed;
      // this value is NEVER an article URL, claim or native publication time.
      const hasPublisherLink=[...item.matchAll(
        /<(?:atom:)?link\b([^>]*?)\/?\s*>/giu,
      )].some(([,attrs])=>{
        const rel=attrs.match(/\brel\s*=\s*["']([^"']+)["']/iu)?.[1]??"alternate";
        if(!["alternate","canonical"].includes(rel))return false;
        const href=attrs.match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1];
        try{
          const u=new URL(href);
          return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&
            !u.hash&&source.original_hosts.includes(u.hostname)&&
            u.pathname!==new URL(source.url).pathname;
        }catch{return false;}
      });
      if(hasPublisherLink && Buffer.byteLength(item,"utf8")<=8192){
        const normalized=item.replace(
          /<(?:atom:)?updated(?:\s[^>]*)?>[\s\S]*?<\/(?:atom:)?updated>/giu,"",
        ).replace(/\s+/gu," ").trim();
        if(normalized.length>=20){
          identity=source.id+"|opaque-atom-entry|"+normalized;
          identityKind="OPAQUE_FIRST_PARTY_FEED_ENTRY";
        }
      }
    }
    if(identity){
      const sha=digest(identity);
      if(!seen.has(sha)){
        seen.add(sha);
        records.push({
          schema:"geomacro.private-undated-first-party-observation.v1",
          domain:source.domain,source_id:source.id,
          // Legacy SHA field is a PRIVATE feed identity; if ID-backed it is
          // NOT an approved original URL or evidence that an article exists.
          original_link_sha256:sha,
          headline_sha256:title?.hash??digest(source.id+"|unreadable-title|"+sha),
          private_relevance_triage:triage,
          headline_fingerprint_verified:title!==null,
          feed_entry_identity_kind:identityKind,
          first_seen_at:now.toISOString(),
          publication_clock_status:"UNKNOWN",
          original_article_path_verified:false,
          original_article_content_verified:false,
          article_category_relevance_verified:false,
          commercial_derived_use_rights_verified:false,
          eligible_for_scoring:false,eligible_for_publication:false,
        });
      }
    }
  }
  return records;
}
