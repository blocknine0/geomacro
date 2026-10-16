import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {GEOMACRO_CAPABILITY_PRICES} from "./capability-pricing-catalog";
import {
 GEOMACRO_NOCHARGE_REASONS,exactGeomacroIfNoneMatch,
 makeGeomacroNoChargeResponse,makeGeomacroUnchangedNoChargeResponse,
} from "./geomacro-nocharge";

const HASH="sha256:"+"a".repeat(64);
const OTHER="sha256:"+"b".repeat(64);
const base={
 request_id:"req_safe_1234",capability:"structural_country_digest",
 subject:{type:"country" as const,id:"CHN"},
 reason_detail:"No verified current finding is available; not low risk.",
 payment_attempted:false as const,delivery_committed:false as const,
};
describe("no-charge v1: fail closed before settlement",()=>{
 it("locks schema to the existing founder-approved 8-capability catalog",()=>{
  const schema=JSON.parse(readFileSync("src/contracts/schemas/v1/nocharge.json","utf8"));
  expect(schema.$id).toBe("https://geomacro.live/schemas/v1/nocharge.json");
  expect(schema.additionalProperties).toBe(false);
  expect(schema.properties.capability.enum.sort()).toEqual(Object.keys(GEOMACRO_CAPABILITY_PRICES).sort());
  expect(schema.properties.billing.properties.reason.enum).toEqual([...GEOMACRO_NOCHARGE_REASONS]);
  expect(schema.properties.billing.properties.charged.const).toBe(false);
  expect(schema.properties.billing.properties.price_usdc.const).toBe("0");
 });
 it.each(["STALE_NO_CHARGE","UNAVAILABLE_NO_CHARGE","INSUFFICIENT_EVIDENCE_NO_CHARGE","FAILED_NO_CHARGE"] as const)(
  "creates zero-price %s",reason=>{
   expect(makeGeomacroNoChargeResponse({...base,reason,retry_after_s:900}))
    .toStrictEqual({schema:"geomacro.nocharge.v1",
      request_id:base.request_id,capability:base.capability,subject:base.subject,
      reason_detail:base.reason_detail,retry_after_s:900,
      billing:{charged:false,price_usdc:"0",reason}});
 });
 it("unchanged requires exact header AND exact real server-verified content hash",()=>{
  expect(exactGeomacroIfNoneMatch('"'+HASH+'"',HASH)).toBe(true);
  expect(exactGeomacroIfNoneMatch(HASH,HASH)).toBe(true);
  const ready={...base,if_none_match:'"'+HASH+'"',
   content_hash:HASH,verified_current_content_hash:HASH};
  expect(makeGeomacroUnchangedNoChargeResponse(ready)).toMatchObject({
   billing:{charged:false,price_usdc:"0",reason:"UNCHANGED_NO_CHARGE"},
   content_hash:HASH,
  });
  for(const header of ["*",'"'+OTHER+'"','W/"'+HASH+'"','"'+HASH+'", "'+OTHER+'"',null]){
    expect(makeGeomacroUnchangedNoChargeResponse({...ready,if_none_match:header})).toBeNull();
  }
  expect(makeGeomacroUnchangedNoChargeResponse({...ready,verified_current_content_hash:OTHER})).toBeNull();
  expect(makeGeomacroUnchangedNoChargeResponse({...ready,content_hash:"sha256:bad"})).toBeNull();
 });
 it("never allows forged unchanged on ordinary unavailability",()=>{
  expect(()=>makeGeomacroNoChargeResponse({...base,reason:"UNCHANGED_NO_CHARGE" as never}))
   .toThrow("NOCHARGE_REASON_NOT_PERMITTED");
 });
 it("rejects payment/commit, customer prices, source leaks and invalid subjects",()=>{
  for(const bad of [
   {payment_attempted:true},{delivery_committed:true},
   {capability:"unregistered"},
   {subject:{type:"country",id:"CN"}},
   {subject:{type:"country",id:"CHN<script>"}},
   {reason_detail:"Download https://secret.example/key"},
   {reason_detail:"provider_id confidential"},
   {reason_detail:"a".repeat(201)},
   {retry_after_s:-1},{retry_after_s:900.5},{retry_after_s:86401},
   {request_id:"bad"},
  ]){
   expect(()=>makeGeomacroNoChargeResponse({
    ...base,reason:"UNAVAILABLE_NO_CHARGE",...bad} as never)).toThrow();
  }
 });
});
