import {createHash} from "node:crypto";
import {isCanonicalSameEventIdentity,sameEventClaimHash}
 from "./independent-same-event-qualification.mjs";

const CLAIM_CATEGORY=Object.freeze({
 GEOPOLITICS:"geopolitics",geopolitics:"geopolitics",
 MACRO_FX:"macro",macro:"macro",
 CRITICAL_MINERALS:"rare_earth",rare_earth:"rare_earth"
});
const STREAM_CATEGORY=Object.freeze({geopolitics:"GEOPOLITICS",macro:"MACRO_FX",
 rare_earth:"CRITICAL_MINERALS"});
const UTC_CLOCK=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const sha=value=>createHash("sha256").update(value,"utf8").digest("hex");
const fail=code=>{throw Error("RISK_STREAM_EVENT_IDENTITY_"+code)};

function identityOf(original){
 const identity=original?.event_identity??original?.event;
 const canonicalCategory=CLAIM_CATEGORY[original?.category];
 if(!canonicalCategory||!isCanonicalSameEventIdentity(canonicalCategory,identity)||
    typeof identity.occurred_at!=="string"||!UTC_CLOCK.test(identity.occurred_at)||
    !Number.isFinite(Date.parse(identity.occurred_at)))
  fail("INVALID_OR_NONCANONICAL_CLAIM");
 return {canonicalCategory,identity};
}

export function canonicalRiskStreamCategory(value){
 const claimCategory=CLAIM_CATEGORY[value];
 if(!claimCategory)fail("CATEGORY_INVALID");
 return STREAM_CATEGORY[claimCategory];
}

export function normalizedEventIdentity(original){return identityOf(original).identity;}

/** Reuse the exact WHO/WHAT/WHERE/WHEN claim digest used by private review. */
export function canonicalEventClaim(original){
 const {canonicalCategory,identity}=identityOf(original);
 return sameEventClaimHash(canonicalCategory,identity);
}

function streamIdentity(original){
 const {identity}=identityOf(original);
 const claim=canonicalEventClaim(original);
 const entities=["ACTOR","TARGET","LOCATION"].map((kind,index)=>
  kind+":"+sha(identity[["actor_id","target_id","location_id"][index]]).slice(0,32).toUpperCase()
 ).sort();
 return {event_key:"CLAIM:"+claim.toUpperCase(),entities};
}

/**
 * Build the exact stream-worker identity digest. The canonical private claim
 * hash is carried in event_key; the endpoint then hashes its own established
 * [country, category, event_key, entities] tuple without an alternate rule.
 */
export function eventFingerprint(original){
 const {identity}=identityOf(original),{event_key,entities}=streamIdentity(original);
 return sha(JSON.stringify([identity.country_iso3,
  canonicalRiskStreamCategory(original.category),event_key,entities]));
}

export function eventIdentityFields(original){
 const {identity}=identityOf(original);
 const {event_key,entities}=streamIdentity(original);
 return {event_key,entities,event_fingerprint:sha(JSON.stringify([
  identity.country_iso3,canonicalRiskStreamCategory(original.category),event_key,entities
 ]))};
}
