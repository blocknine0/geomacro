import {createHash} from "node:crypto";
import {clusterPrivateIndependentEventCandidates} from "./private-independent-event-review-queue.mjs";
import {isCanonicalSameEventIdentity,sameEventClaimHash,
 registeredOriginalPublisherOrganization} from "./independent-same-event-qualification.mjs";

/**
 * Converts already structured, privately acquired first-party reports into
 * canonical risk-stream originals. It never extracts facts from prose and
 * never creates or upgrades signatures. Facts/Rights signatures must already
 * cover the final emitted risk-stream claim; the Worker verifies them again.
 */
const ROLE_PAIRS=Object.freeze({
 geopolitics:["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"],
 macro:["OFFICIAL_STATISTICS","MARKET_PRICE"],
 rare_earth:["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]
});
const CATEGORY=Object.freeze({
 geopolitics:"GEOPOLITICS",macro:"MACRO_FX",rare_earth:"CRITICAL_MINERALS"
});
const HASH=/^[a-f0-9]{64}$/u;
const SOURCE=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
const DOMAIN=/^[a-z0-9.-]{3,253}$/u;
const PARENT=/^[a-z0-9_.:-]{1,100}$/u;
const TOKEN=/^[a-z][a-z0-9_-]{2,79}$/u;
const FEED=new Set(["OFFICIAL_API","RSS","WEBSITE_INTELLIGENCE"]);
const fail=()=>{throw Error("PRIVATE_RISK_STREAM_PAIR_INVALID")};
const sha=value=>createHash("sha256").update(value,"utf8").digest("hex");
const canonical=value=>JSON.stringify(value);
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&
 Object.keys(value).sort().join("|")===keys.slice().sort().join("|");
const safeDerived=value=>exact(value,["what","why","market","watch"])&&
 Object.values(value).every(x=>typeof x==="string"&&x.length>=6&&x.length<=360&&
  !/https?:\/\/|<[^>]+>|[\r\n]/iu.test(x));
const base64Signature=value=>typeof value==="string"&&value.length>=80&&
 value.length<=256&&/^[A-Za-z0-9+/]+={0,2}$/u.test(value);

function canonicalStreamIdentity(candidate){
 const event=candidate.event,category=CATEGORY[candidate.category];
 if(!category||!isCanonicalSameEventIdentity(candidate.category,event))fail();
 const claim=sameEventClaimHash(candidate.category,event);
 if(candidate.same_event_claim_sha256!==claim)fail();
 const entities=[
  "ACTOR:"+event.actor_id.toUpperCase(),
  "COUNTRY:"+event.country_iso3,
  "LOCATION:"+event.location_id.toUpperCase(),
  "TARGET:"+event.target_id.toUpperCase()
 ].sort();
 if(entities.length>12||new Set(entities).size!==entities.length||
    entities.some(x=>!/^[A-Z0-9:_-]{2,64}$/u.test(x)))fail();
 const eventKey="CLAIM_"+claim.toUpperCase();
 const eventFingerprint=sha(canonical([
  event.country_iso3,category,eventKey,entities
 ]));
 return {claim,category,eventKey,entities,eventFingerprint};
}

function makeCandidate(input,identity){
 const s=input.risk_stream;
 if(!exact(s,["feed_origin","source_id","publisher_root_domain",
    "parent_media_entity","source_role","derived","raw_payload","proof"])||
    !FEED.has(s.feed_origin)||!SOURCE.test(s.source_id??"")||
    !DOMAIN.test(s.publisher_root_domain??"")||
    !PARENT.test(s.parent_media_entity??"")||
    !ROLE_PAIRS[input.category].includes(s.source_role)||
    !safeDerived(s.derived)||typeof s.raw_payload!=="string"||
    s.raw_payload.length<16||Buffer.byteLength(s.raw_payload,"utf8")>8000||
    !exact(s.proof,["facts_signature_b64","rights_signature_b64"])||
    !base64Signature(s.proof.facts_signature_b64)||
    !base64Signature(s.proof.rights_signature_b64))fail();
 let url;try{url=new URL(input.original_article_url)}catch{fail()}
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
    url.href.length>2048||url.hostname.toLowerCase()!==input.publisher_host||
    !(url.hostname===s.publisher_root_domain||
      url.hostname.endsWith("."+s.publisher_root_domain))||
    registeredOriginalPublisherOrganization(url.hostname)!==
      input.originating_reporting_organization_id||
    input.originating_reporting_organization_id!==input.publisher_organization_id||
    !HASH.test(input.original_article_sha256??"")||
    sha(s.raw_payload)!==input.original_article_sha256)fail();
 const roles=ROLE_PAIRS[input.category];
 return {
  schema:"geomacro.risk-stream-candidate.v1",
  kind:"VERIFIED_ORIGINAL",
  country_iso3:input.event.country_iso3,
  category:identity.category,
  feed_origin:s.feed_origin,
  event_key:identity.eventKey,
  event_fingerprint:identity.eventFingerprint,
  entities:identity.entities,
  source_id:s.source_id,
  source_url:url.href,
  publisher_root_domain:s.publisher_root_domain,
  parent_media_entity:s.parent_media_entity,
  source_role:s.source_role,
  published_at:input.original_published_at,
  original_page_sha256:input.original_article_sha256,
  derived:s.derived,
  raw_payload:s.raw_payload,
  proof:{
   facts_signature_b64:s.proof.facts_signature_b64,
   rights_signature_b64:s.proof.rights_signature_b64
  }
 };
}

/**
 * Input records use the existing private review-queue schema plus a private
 * risk_stream attestation envelope. Only exact canonical same-event groups
 * with two registered, independently authored confirmations are emitted.
 * Any dispute/retraction vetoes the whole claim. No source record is exposed
 * in the returned receipt; candidate objects are intended for the authenticated
 * internal risk-stream producer only.
 */
export function producePrivateIndependentRiskStreamCandidates({
 candidates=[],now=new Date()
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Array.isArray(candidates)||candidates.length>96||
    candidates.some(x=>x?.schema!=="geomacro.private-independent-event-source-candidate.v1"))fail();
 const queue=clusterPrivateIndependentEventCandidates({candidates,now});
 const qualifiedClaims=new Set(queue.review_candidates.filter(x=>
  x.state==="MULTI_ORIGIN_REVIEW_REQUIRED"&&
  x.independent_origin_count===2&&x.distinct_article_hash_count===2&&
  x.confirming_origin_count===2&&x.disputing_origin_count===0&&
  x.retracting_origin_count===0&&x.original_publication_spread_minutes<=90
 ).map(x=>x.event_claim_sha256));
 const grouped=new Map();
 for(const input of candidates){
  const claim=sameEventClaimHash(input.category,input.event);
  if(!qualifiedClaims.has(claim))continue;
  if(!grouped.has(claim))grouped.set(claim,[]);
  grouped.get(claim).push(input);
 }
 const output=[];
 for(const [claim,items] of grouped){
  if(items.length!==2)continue;
  const identity=canonicalStreamIdentity(items[0]);
  const otherIdentity=canonicalStreamIdentity(items[1]);
  if(identity.claim!==claim||otherIdentity.claim!==claim||
     identity.eventFingerprint!==otherIdentity.eventFingerprint||
     identity.eventKey!==otherIdentity.eventKey||
     canonical(identity.entities)!==canonical(otherIdentity.entities)||
     items[0].event.country_iso3!==items[1].event.country_iso3||
     items[0].category!==items[1].category||
     items[0].source_role===items[1].source_role||
     !ROLE_PAIRS[items[0].category].every(role=>
       items.some(x=>x.risk_stream?.source_role===role)))fail();
  const pair=items.map(x=>makeCandidate(x,identity))
   .sort((a,b)=>a.source_id.localeCompare(b.source_id));
  if(pair[0].source_id===pair[1].source_id||
     pair[0].publisher_root_domain===pair[1].publisher_root_domain||
     pair[0].parent_media_entity===pair[1].parent_media_entity||
     pair[0].event_fingerprint!==pair[1].event_fingerprint)fail();
  output.push(...pair);
 }
 output.sort((a,b)=>a.event_fingerprint.localeCompare(b.event_fingerprint)||
  a.source_id.localeCompare(b.source_id));
 return {
  schema:"geomacro.private-independent-risk-stream-producer.v1",
  status:output.length?"CANDIDATE_PAIRS_READY_FOR_WORKER_PROOF_CHECK":
   "NO_QUALIFIED_TWO_ORIGINAL_PAIRS",
  event_claims_examined:queue.matched_event_claims,
  qualifying_event_pairs:output.length/2,
  candidate_count:output.length,
  candidates:output,
  proof_signatures_created:false,
  Worker_signature_and_source_registry_verification_required:true,
  commercial_release_authorized:false,
  customer_delivery_authorized:false,
  execution_authorized:false,
  payments:0
 };
}
