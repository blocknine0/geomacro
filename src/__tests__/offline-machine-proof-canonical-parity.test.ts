import {describe,it,expect} from "vitest";
import {canonicalRiskObjectJson}
 from "../lib/risk-object-signing.server";
import {canonicalMachineProofBytes}
 from "../../scripts/lib/geomacro-offline-machine-issuer.mjs";

describe("offline facts/rights issuer is byte-for-byte identical to GRO dual-signature verifier",()=>{
 it("matches canonical JSON with nested objects, sorted keys and arrays",()=>{
  const proof={
    source_permissions:[{z:"last",a:{p:true,y:["yes",{b:2,a:1}]}}],
    schema:"geomacro.automated-commercial-proof.v1",
    profile:"GEOMACRO_AUTOMATED_CROSS_SOURCE_NOT_EXTERNAL_REVIEWED_V1",
    country_iso3:"USA",category:"macro",
    at:{z:0,b:3},flags:{verified:false},
  };
  expect(canonicalMachineProofBytes(proof).toString("utf8"))
   .toBe(canonicalRiskObjectJson(proof));
 });
});
