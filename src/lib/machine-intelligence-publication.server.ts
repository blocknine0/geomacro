import {createHash} from "node:crypto";
import {canonicalRiskObjectJson} from "./risk-object-signing.server";
import {createGeomacroMachineCommercialQualifier, MACHINE_COMMERCIAL_PROFILE,
  type MachineCommercialEnvelope} from "./geomacro-machine-commercial-qualification.server";
import {validatedSnapshot} from "./on-demand-qualified-country-risk.server";
import {pinnedMachineCommercialSourceHandoff} from "./machine-commercial-publisher-handoff.server";
import type {CountryRiskEventInput} from "./country-risk-engine";
import type {MachineOriginalWithRegistry} from "./geomacro-machine-source-rights.server";
import {derivedCustomerRowSha256} from "../../scripts/lib/independent-same-event-qualification.mjs";

type Package = {
  schema:"geomacro.private-machine-intelligence-event.v1";
  category:"geopolitics"|"macro"|"rare_earth";
  country_iso3:string;
  event:CountryRiskEventInput;
  candidates:MachineOriginalWithRegistry[];
  envelope:MachineCommercialEnvelope;
};
const fail=()=>{throw Error("MACHINE_INTELLIGENCE_PUBLICATION_NOT_QUALIFIED")};
const hash=(x:unknown)=>createHash("sha256").update(canonicalRiskObjectJson(x)).digest("hex");

// Deterministic projection ONLY from the event covered by BOTH signatures.
// Unsigned caller narrative, score, delta or a new publication clock cannot
// replace the signed event. Source identities never enter customer rows.
export function machineIntelligenceDerivedRow(pkg:Package,now=new Date()) {
  const pins=pinnedMachineCommercialSourceHandoff(pkg.envelope,pkg.candidates,now);
  const event=pkg.event;
  const row={id:event.id,source_title:event.title,
    summary:event.structured_payload?.public_summary ?? null,
    category:pkg.category,severity:event.severity,delta:null,
    created_at:pins.original_native_source_as_of,
    published_at:pins.original_native_source_as_of,public_status:"verified_b2"};
  derivedCustomerRowSha256(row);
  return row;
}

// No issuer private keys and no signature creation. Existing approved public
// pins verify real dual proofs; the existing source/rights reader rereads the
// original bytes before canonical publication. This is never external review.
export async function qualifyMachineIntelligenceBatch({rows,eventPackages,now=new Date(),receiptTime=now}:{
  rows:unknown[];eventPackages:Package[];now?:Date;receiptTime?:Date;
},deps:Parameters<typeof createGeomacroMachineCommercialQualifier>[1]={}) {
  const input=JSON.parse(canonicalRiskObjectJson({rows,eventPackages}));
  if(!Array.isArray(input.rows)||!Array.isArray(input.eventPackages)||
     input.rows.length<3||input.rows.length>12||input.rows.length!==input.eventPackages.length||
     !Number.isFinite(now.getTime())||!Number.isFinite(receiptTime.getTime())||
     receiptTime.getTime()>now.getTime()||now.getTime()-receiptTime.getTime()>5*60_000)fail();
  const seen=new Set<string>(),domains=new Set<string>(),qualified=[];
  let until=Infinity;
  for(let i=0;i<input.rows.length;i++) {
    const pkg=input.eventPackages[i] as Package;
    if(pkg?.schema!=="geomacro.private-machine-intelligence-event.v1"||
       !pkg.event||seen.has(pkg.event.id))fail();
    seen.add(pkg.event.id);domains.add(pkg.category);
    const snapshot=validatedSnapshot({category:pkg.category,country_iso3:pkg.country_iso3,
      events:[pkg.event]},now);
    const expected=machineIntelligenceDerivedRow(pkg,now);
    const rowHash=derivedCustomerRowSha256(input.rows[i]);
    if(rowHash!==derivedCustomerRowSha256(expected))fail();
    const result=await createGeomacroMachineCommercialQualifier(pkg,deps)({
      category:pkg.category,country_iso3:pkg.country_iso3,
      evidence_sha256:snapshot.sha256,events:snapshot.evidence,now,
    });
    if(!result?.verified_commercial_rights||!result.independent_claims_verified)fail();
    until=Math.min(until,Date.parse(pkg.envelope.proof.expires_at),
      ...pkg.envelope.proof.source_permissions.map(p=>Date.parse(p.permission_expires_at)),
      ...pkg.candidates.map(c=>Date.parse(String(c.original_published_at))+6*3600_000));
    qualified.push({event_id:pkg.event.id,category:pkg.category,
      country_iso3:pkg.country_iso3,derived_row_sha256:rowHash,
      machine_proof_sha256:hash(pkg.envelope.proof),
      exact_evidence_sha256:snapshot.sha256,dual_authority_signatures_verified:true});
  }
  if(!["geopolitics","macro","rare_earth"].every(d=>domains.has(d))||
     !Number.isFinite(until)||until<=now.getTime())fail();
  const receipt={schema:"geomacro.machine-intelligence-admission.v1",
    authority_profile:MACHINE_COMMERCIAL_PROFILE,external_reviewer_attested:false,
    generated_at:receiptTime.toISOString(),commercial_event_admission:true,
    qualified_event_count:qualified.length,qualified,
    qualified_until:new Date(until).toISOString(),
    no_raw_news_exposed:true,payment_performed:false};
  return {receipt,receipt_sha256:hash(receipt),qualified_until:receipt.qualified_until};
}
