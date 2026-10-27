/**
 * One PRIVATE source-neutral observation set, one immutable SHA-256 identity.
 * Existing protected collector consumes one raw RSS/Atom response per issuer,
 * classifies ALL three categories in memory, and keeps raw bytes ephemeral.
 *
 * These identity receipts allow D1 direct-write and encrypted GitHub replay
 * to prove that their validated inputs are the SAME records, without
 * re-fetching the publisher, creating a second D1 query or exposing originals.
 * B2 private raw archives / R2 public projections remain separately governed.
 */
import {createHash} from "node:crypto";
import {validateReusableSourceNewsItem} from "../../workers/control-plane/src/reusable-source-news.mjs";

export const SHARED_PRIVATE_SOURCE_READ_SCHEMA="geomacro.private-source-shared-read-manifest.v1";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const CATEGORIES=["geopolitics","macro","rare_earth"];
const sha=/^[a-f0-9]{64}$/u;
export function buildPrivateSourceSharedReadManifest(items,now=Date.now()){
 if(!Array.isArray(items)||items.length>768||!Number.isFinite(now))
  throw Error("PRIVATE_SOURCE_SHARED_INPUT_INVALID");
 const byId=new Map();
 for(const item of items){
  // Reuse the canonical D1 input validator. This rejects raw publisher
  // headlines, original-page URLs, novel rights and forged verification.
  const canonical=validateReusableSourceNewsItem(item,now);
  if(!/^news-[a-f0-9]{64}$/u.test(item?.id??"")||
     !CATEGORIES.includes(item.category))
   throw Error("PRIVATE_SOURCE_SHARED_ITEM_INVALID");
  const bytes=Buffer.from(canonical,"utf8");
  if(bytes.length<64||bytes.length>16_384)
   throw Error("PRIVATE_SOURCE_SHARED_ITEM_SIZE_INVALID");
  const digest=hash(bytes);
  if(byId.has(item.id)){
   if(byId.get(item.id).sha256!==digest)
    throw Error("PRIVATE_SOURCE_SHARED_ID_COLLISION");
   throw Error("PRIVATE_SOURCE_SHARED_DUPLICATE");
  }
  byId.set(item.id,{id:item.id,sha256:digest,category:item.category});
 }
 const members=[...byId.values()].sort((a,b)=>a.id.localeCompare(b.id));
 const content=members.map(x=>x.id+"\n"+x.sha256+"\n"+x.category).join("\n");
 const counts=Object.fromEntries(CATEGORIES.map(category=>[
  category,members.filter(x=>x.category===category).length,
 ]));
 return Object.freeze({
  schema:SHARED_PRIVATE_SOURCE_READ_SCHEMA,
  identity_kind:"SOURCE_NEUTRAL_PRIVATE_OBSERVATION_NOT_RAW_PUBLISHER_BYTES",
  item_count:members.length,
  counts_by_category:Object.freeze(counts),
  content_sha256:hash("geomacro-private-source-shared-read-v1\n"+content),
  raw_publisher_stored:false,
  commercial_rights_verified:false,
  independently_verified:false,
  canonical_d1_durable:false,
 });
}
export function assertPrivateSourceSharedReadManifest(items,manifest,now=Date.now()){
 if(!manifest||manifest.schema!==SHARED_PRIVATE_SOURCE_READ_SCHEMA||
    manifest.identity_kind!=="SOURCE_NEUTRAL_PRIVATE_OBSERVATION_NOT_RAW_PUBLISHER_BYTES"||
    manifest.raw_publisher_stored!==false||
    manifest.commercial_rights_verified!==false||
    manifest.independently_verified!==false||
    manifest.canonical_d1_durable!==false||
    !sha.test(manifest.content_sha256??""))
  throw Error("PRIVATE_SOURCE_SHARED_MANIFEST_UNSAFE");
 const expected=buildPrivateSourceSharedReadManifest(items,now);
 if(JSON.stringify(expected)!==JSON.stringify(manifest))
  throw Error("PRIVATE_SOURCE_SHARED_MANIFEST_MISMATCH");
 return expected;
}
