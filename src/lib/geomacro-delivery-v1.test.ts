import {describe,expect,it,vi} from "vitest";
import {assertGeomacroDeliveryV1} from "./geomacro-delivery-v1";

const HASH="sha256:"+"a".repeat(64);
const now=new Date("2026-10-17T10:00:30.000Z");
const example=()=>{
 return {
 schema:"geomacro.delivery.v1",request_id:"req_test_v1_123",
 capability:"structural_country_digest",delivered_at:"2026-10-17T10:00:00Z",
 billing:{charged:true,price_usdc:"0.02",reason:"DELIVERED"},
 subject:{type:"country",id:"CHN"},data_state:"AVAILABLE",
 freshness:{as_of:"2026-10-17T09:58:00Z",label:"near_realtime",max_age_s:900,stale:false},
 summary:"TEST ONLY – parsed derived risk statement, not a real event.",
 result:{country:"CHN",composite:{state:"AVAILABLE"}},
 provenance:{basis:"geomacro_findings",evidence_count:2,evidence_hash:HASH},
 limits:{execution_authorized:false,advisory_only:true},
 attribution:{notice:"Derived by Geomacro.",url:"https://geomacro.live/attributions"},
 integrity:{alg:"ed25519",key_id:"gm-test-only",canonicalization:"JCS-RFC8785",
  content_hash:HASH,signature:"X".repeat(88)},
 };
};
const expected={capability:"structural_country_digest",variant:"standard",
 verified_content_hash:HASH,now};
const proofs=(evidence=false,signature=false,settlement=false)=>({
 verifyCurrentRightsAndEvidence:vi.fn(async()=>evidence),
 verifySignatureAndContentHash:vi.fn(async()=>signature),
 verifySettledDelivery:vi.fn(async()=>settlement),
});
describe("draft delivery v1 admission does not authorize payments",()=>{
 it("does not accept a contract without independent proof callbacks",async()=>{
  await expect(assertGeomacroDeliveryV1(example(),expected,undefined as never))
   .rejects.toThrow("DELIVERY_TRUST_PROOFS_MISSING");
 });
 it("requires actual independent evidence, signature verification and settled ledger",async()=>{
  for(const [a,b,c,code] of [
   [false,false,false,"DELIVERY_RIGHTS_AND_EVIDENCE_UNVERIFIED"],
   [true,false,false,"DELIVERY_CRYPTOGRAPHIC_PROOF_UNVERIFIED"],
   [true,true,false,"DELIVERY_SETTLEMENT_UNVERIFIED"],
  ] as const){
   await expect(assertGeomacroDeliveryV1(example(),expected,proofs(a,b,c))).rejects.toThrow(code);
  }
  const all=proofs(true,true,true);
  await expect(assertGeomacroDeliveryV1(example(),expected,all)).resolves.toBeUndefined();
  expect(all.verifyCurrentRightsAndEvidence).toHaveBeenCalledOnce();
  expect(all.verifySignatureAndContentHash).toHaveBeenCalledOnce();
  expect(all.verifySettledDelivery).toHaveBeenCalledOnce();
 });
 it("never promotes samples, changed prices, stale dates, forged source or wrong subject",async()=>{
  for(const edit of [
   {billing:{charged:true,price_usdc:"0.05",reason:"DELIVERED"}},
   {billing:{charged:false,price_usdc:"0",reason:"UNCHANGED_NO_CHARGE"}},
   {data_state:"PARTIAL"},
   {freshness:{...example().freshness,as_of:"2026-10-10T09:58:00Z"}},
   {freshness:{...example().freshness,as_of:"2026-10-17T10:10:00Z"}},
   {limits:{execution_authorized:true,advisory_only:false}},
   {integrity:{...example().integrity,signature:"SAMPLE_SIGNATURE_NOT_VALID"}},
   {attribution:{...example().attribution,url:"https://provider.example"}},
   {result:{article_url:"https://provider.example",country:"CHN"}},
   {subject:{type:"country",id:"GB"}},
  ]){
   await expect(assertGeomacroDeliveryV1({...example(),...edit},expected,proofs(true,true,true)))
    .rejects.toThrow();
  }
 });
 it("accepts different founder-price variants only when exact capability quote matches",async()=>{
  const quote={...example(),billing:{charged:true,price_usdc:"0.03",reason:"DELIVERED"},
   capability:"structural_country_profile"};
  await expect(assertGeomacroDeliveryV1(quote,{
   ...expected,capability:"structural_country_profile"},proofs(true,true,true)))
   .resolves.toBeUndefined();
  await expect(assertGeomacroDeliveryV1(quote,{
   ...expected,capability:"structural_country_profile",variant:"invalid"},proofs(true,true,true)))
   .rejects.toThrow();
 });
});
