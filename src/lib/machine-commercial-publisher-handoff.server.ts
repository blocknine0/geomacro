import {createHash} from "node:crypto";
import {canonicalRiskObjectJson} from "./risk-object-signing.server";
import type {MachineCommercialEnvelope}
 from "./geomacro-machine-commercial-qualification.server";
import type {MachineOriginalWithRegistry}
 from "./geomacro-machine-source-rights.server";

/** Private post-qualification source-clock/attestation byte pins.
 * These fields do NOT verify signatures/rights themselves. They are
 * calculated only after prepareGeomacroMachineCommercialGRO performed live
 * byte re-read and two independent Ed25519 machine authority checks.
 * Never return source identities/article titles or a public entitlement.
 */
export function pinnedMachineCommercialSourceHandoff(
  envelope:MachineCommercialEnvelope,
  candidates:readonly MachineOriginalWithRegistry[],
  now=new Date(),
) {
 const fail=()=>{throw Error("MACHINE_COMMERCIAL_HANDOFF_NATIVE_PROOF_INVALID")};
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !envelope||!envelope.proof||
    envelope.proof.schema!=="geomacro.automated-commercial-proof.v1"||
    envelope.proof.profile!=="GEOMACRO_AUTOMATED_CROSS_SOURCE_NOT_EXTERNAL_REVIEWED_V1"||
    !Array.isArray(candidates)||candidates.length<2||candidates.length>4||
    !Array.isArray(envelope.proof.source_permissions)||
    envelope.proof.source_permissions.length!==candidates.length)fail();
 const p=envelope.proof,at=Date.parse(p.attested_at),expires=Date.parse(p.expires_at);
 if(!Number.isFinite(at)||!Number.isFinite(expires)||
    at>now.getTime()||expires<=now.getTime()||
    expires-at>60*60_000)fail();
 // This pinning boundary must not turn two articles from the same newsroom
 // into independent first-party original authorities if reused standalone.
 const observed=new Set<string>(),orgs=new Set<string>(),articles=new Set<string>();
 const attestedSourceSet=candidates.map(c=>({
   article_bytes_sha256:c.original_article_sha256,
   original_published_at:c.original_published_at,
   same_event_claim_sha256:c.same_event_claim_sha256,
 })).sort((a,b)=>String(a.article_bytes_sha256).localeCompare(String(b.article_bytes_sha256)));
 const attestedSourceSetSha=createHash("sha256")
   .update(JSON.stringify(attestedSourceSet),"utf8").digest("hex");
 if(attestedSourceSetSha!==p.exact_original_evidence_set_sha256)fail();
 const times=candidates.map(candidate=>{
   const identity=String(candidate.source_registry_id)+":"+candidate.original_article_sha256;
   if(observed.has(identity)||
      orgs.has(String(candidate.originating_reporting_organization_id??""))||
      articles.has(String(candidate.original_article_sha256??"")))fail();
   observed.add(identity);
   orgs.add(String(candidate.originating_reporting_organization_id??""));
   articles.add(String(candidate.original_article_sha256??""));
   if(!/^[a-f0-9]{64}$/u.test(String(candidate.original_article_sha256??""))||
      !/^[a-f0-9]{64}$/u.test(String(candidate.same_event_claim_sha256??""))||
      candidate.same_event_claim_sha256!==p.same_event_claim_sha256||
      !/^[A-Za-z0-9_.:-]{3,160}$/u.test(String(candidate.source_registry_id??""))||
      !/^[A-Za-z0-9_.:-]{3,160}$/u.test(String(candidate.originating_reporting_organization_id??"")))
     fail();
   const time=Date.parse(String(candidate.original_published_at??""));
   if(!Number.isFinite(time)||time>at||time>now.getTime()||
      now.getTime()-time>6*60*60_000)fail();
   // Require exact independently signed article scope, not generic publisher.
   const matching=p.source_permissions.filter(permission=>
       permission.original_article_sha256===candidate.original_article_sha256&&
       permission.source_registry_id===candidate.source_registry_id&&
       permission.originating_reporting_organization_id===
         candidate.originating_reporting_organization_id&&
       permission.licensed_derived_use===true&&
       permission.raw_redistribution_allowed===false&&
       permission.attribution_required===false&&
       Date.parse(permission.permission_expires_at)>now.getTime());
   if(matching.length!==1)fail();
   return time;
 });
 const proofSha=createHash("sha256").update(canonicalRiskObjectJson(p),"utf8").digest("hex");
 return Object.freeze({
  machine_attested_proof_sha256:proofSha,
  machine_attestation_expires_at:p.expires_at,
  original_native_source_as_of:new Date(Math.max(...times)).toISOString(),
  public_hot_published:false as const,
  x402_payment_authorized:false as const,
 });
}
