import {createHash} from "node:crypto";
import {describe,it,expect} from "vitest";
import {pinnedMachineCommercialSourceHandoff}
 from "./machine-commercial-publisher-handoff.server";
import type {MachineCommercialEnvelope} from "./geomacro-machine-commercial-qualification.server";
import type {MachineOriginalWithRegistry} from "./geomacro-machine-source-rights.server";

const now=new Date("2026-10-17T11:00:00.000Z");
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const candidates=[
 {source_registry_id:"fed_original",originating_reporting_organization_id:"federal_reserve",
  original_article_sha256:sha("synthetic-original-a"),
  original_published_at:"2026-10-17T10:10:00Z",same_event_claim_sha256:sha("event-claim")},
 {source_registry_id:"independent_second",originating_reporting_organization_id:"independent_issuer",
  original_article_sha256:sha("synthetic-original-b"),
  original_published_at:"2026-10-17T10:25:00Z",same_event_claim_sha256:sha("event-claim")},
] as MachineOriginalWithRegistry[];
function envelope():MachineCommercialEnvelope{
 const originalSet=candidates.map(c=>({
  article_bytes_sha256:c.original_article_sha256,
  original_published_at:c.original_published_at,
  same_event_claim_sha256:c.same_event_claim_sha256,
 })).sort((a,b)=>String(a.article_bytes_sha256).localeCompare(String(b.article_bytes_sha256)));
 return {proof:{
  schema:"geomacro.automated-commercial-proof.v1",
  profile:"GEOMACRO_AUTOMATED_CROSS_SOURCE_NOT_EXTERNAL_REVIEWED_V1",
  same_event_claim_sha256:sha("event-claim"),
  attested_at:"2026-10-17T10:45:00Z",expires_at:"2026-10-17T11:20:00Z",
  exact_original_evidence_set_sha256:sha(JSON.stringify(originalSet)),
  source_permissions:candidates.map(c=>({
   source_registry_id:c.source_registry_id,
   originating_reporting_organization_id:c.originating_reporting_organization_id,
   original_article_sha256:c.original_article_sha256,
   licensed_derived_use:true,raw_redistribution_allowed:false,attribution_required:false,
   permission_expires_at:"2026-10-18T11:00:00Z",
  })),
 } as MachineCommercialEnvelope["proof"],
 facts_signature_b64:"synthetic_not_verified_here",
 rights_signature_b64:"synthetic_not_verified_here"};
}
describe("private three-domain machine signed GRO publisher handoff pins",()=>{
 it("deterministically binds original native clocks, source-set SHA and proof expiry",()=>{
  const p=envelope();
  const r=pinnedMachineCommercialSourceHandoff(p,candidates,now);
  expect(r.machine_attested_proof_sha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(r.original_native_source_as_of).toBe("2026-10-17T10:25:00.000Z");
  expect(r.machine_attestation_expires_at).toBe("2026-10-17T11:20:00Z");
  expect(r.public_hot_published).toBe(false);
  expect(r.x402_payment_authorized).toBe(false);
  const reordered=pinnedMachineCommercialSourceHandoff(p,[candidates[1],candidates[0]],now);
  expect(reordered.machine_attested_proof_sha256).toBe(r.machine_attested_proof_sha256);
 });
 it("refuses swapped article bytes, timestamp, tampered proof and duplicate refs",()=>{
  const p=envelope();
  const altered=[{...candidates[0],original_article_sha256:sha("forged")},candidates[1]];
  expect(()=>pinnedMachineCommercialSourceHandoff(p,altered,now)).toThrow();
  expect(()=>pinnedMachineCommercialSourceHandoff(p,[
   {...candidates[0],original_published_at:"2026-10-17T10:15:00Z"},candidates[1],
  ],now)).toThrow();
  expect(()=>pinnedMachineCommercialSourceHandoff(p,[candidates[0],candidates[0]],now)).toThrow();
  expect(()=>pinnedMachineCommercialSourceHandoff({
   ...p,proof:{...p.proof,exact_original_evidence_set_sha256:"0".repeat(64)},
  },candidates,now)).toThrow();
 });
 it("rejects same newsroom, reused article, tampered event claim and wrong trust profile",()=>{
  const p=envelope();
  const sameOrg=[candidates[0],{...candidates[1],
    originating_reporting_organization_id:candidates[0].originating_reporting_organization_id}];
  expect(()=>pinnedMachineCommercialSourceHandoff(p,sameOrg,now)).toThrow();
  const reusedArticle=[candidates[0],{...candidates[1],
    original_article_sha256:candidates[0].original_article_sha256}];
  expect(()=>pinnedMachineCommercialSourceHandoff(p,reusedArticle,now)).toThrow();
  const mismatchedClaim=[candidates[0],{...candidates[1],
    same_event_claim_sha256:sha("different-claim")}];
  expect(()=>pinnedMachineCommercialSourceHandoff(p,mismatchedClaim,now)).toThrow();
  expect(()=>pinnedMachineCommercialSourceHandoff({...p,proof:{
    ...p.proof,profile:"FEDERICO_STRICT" as never,
  }},candidates,now)).toThrow();
  expect(()=>pinnedMachineCommercialSourceHandoff({...p,proof:{
    ...p.proof,source_permissions:[p.proof.source_permissions[0],
      p.proof.source_permissions[0]],
  }},candidates,now)).toThrow();
 });
 it("refuses stale/future articles, expired attestation, and forbidden public attribution",()=>{
  const p=envelope();
  for(const update of [
   {attested_at:"2026-10-16T08:00:00Z"},
   {expires_at:"2026-10-17T10:58:00Z"},
   {expires_at:"2026-10-17T12:00:00Z"},
   {source_permissions:[{...p.proof.source_permissions[0],attribution_required:true},
     p.proof.source_permissions[1]]},
   {source_permissions:[{...p.proof.source_permissions[0],
     permission_expires_at:"2026-10-17T10:00:00Z"},p.proof.source_permissions[1]]},
  ])expect(()=>pinnedMachineCommercialSourceHandoff(
   {...p,proof:{...p.proof,...update} as never},candidates,now)).toThrow();
  expect(()=>pinnedMachineCommercialSourceHandoff(p,candidates,
   new Date("2026-10-17T17:10:00Z"))).toThrow();
 });
 it("cannot imply independent external reviewer, B2/D1 hot publication or payment",()=>{
  const r=pinnedMachineCommercialSourceHandoff(envelope(),candidates,now);
  expect(Object.keys(r)).not.toContain("external_reviewer_attested");
  expect(Object.keys(r)).not.toContain("rights_verified");
  expect(Object.keys(r)).not.toContain("commercial_eligible");
  expect(Object.keys(r)).not.toContain("public_intelligence_published");
 });
});
