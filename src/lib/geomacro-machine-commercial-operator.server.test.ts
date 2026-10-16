import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {parsePrivateMachineCommercialRequest}
  from "../../scripts/ops/accept-private-geomacro-machine-commercial-gro";

const request={
 schema:"geomacro.private-machine-commercial-request.v1",
 category:"macro",country_iso3:"USA",
 country_name:"United States",
 event:{id:"source-authenticated-fixture"},
 candidates:[{source_registry_id:"fed"}, {source_registry_id:"ecb"}],
 envelope:{proof:{schema:"geomacro.automated-commercial-proof.v1"}},
};
describe("manual machine commercial GRO operator boundary",()=>{
 it("parses only an owner-private single-event dual-proof shape",()=>{
  const r=parsePrivateMachineCommercialRequest(JSON.stringify(request));
  expect(r.country_iso3).toBe("USA");
  expect(r.category).toBe("macro");
  expect(r.event).toEqual(request.event);
 });
 it("rejects public caller supplied flags, profiles, trusted keys and bulk records",()=>{
  for(const p of [
    {...request,profile:"FEDERICO_STRICT"},
    {...request,independent_reviewer_attested:true},
    {...request,payment_authorized:true},
    {...request,public_hot_published:true},
    {...request,signingMaterial:{private_key:"DO_NOT_TRUST"}},
    {...request,verificationKeys:{fake:"PUBLIC_KEY"}},
    {...request,category:"unknown"},
    {...request,country_iso3:"not-iso"},
    {...request,candidates:[]},
    {...request,candidates:[{}, {}, {}, {}, {}]},
    {...request,envelope:null},
  ])expect(()=>parsePrivateMachineCommercialRequest(JSON.stringify(p)))
    .toThrow("GEOMACRO_MACHINE_COMMERCIAL_PRIVATE_ACCEPTANCE_FAILED");
  expect(()=>parsePrivateMachineCommercialRequest("<html>not JSON</html>")).toThrow();
 });
 it("retains private owner-only file permissions, no x402/D1/B2/partner publication",()=>{
  const source=readFileSync("scripts/ops/accept-private-geomacro-machine-commercial-gro.ts","utf8");
  expect(source).toContain("assertPrivateReviewPaths");
  expect(source).toContain("constants.O_NOFOLLOW");
  expect(source).toContain("constants.O_EXCL");
  expect(source).toContain("0o600");
  expect(source).toContain("paid_customer_delivery_authorized:false");
  expect(source).toContain("x402_payment_authorized:false");
  expect(source).toContain("external_reviewer_attested:false");
  for(const text of ["settleCoinbaseX402(","publishB2VerifiedHotSnapshot(","D1.prepare(","SUPABASE_SERVICE_ROLE_KEY"])
    expect(source).not.toContain(text);
 });
});
