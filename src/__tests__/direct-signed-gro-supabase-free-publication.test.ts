import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {validatedOwnerPrivateGRO,promoteOwnerPrivateGRO}
 from "../../scripts/ops/publish-private-signed-gro-d1";

const sample=readFileSync("docs/partners/predge/gro-signed-test-vector.json","utf8");
const parsed=JSON.parse(sample);
const current=Date.parse("2026-10-20T16:00:00.000Z");

describe("single genuine signed GRO -> B2+D1 without Supabase",()=>{
 it("rejects expired test-key signed artifact, with no fallback",()=>{
  expect(()=>validatedOwnerPrivateGRO(sample,current))
    .toThrow("DIRECT_SIGNED_GRO_D1_PUBLICATION_REFUSED");
 });
 it("rejects manipulated stored payload even with claimed rights",()=>{
  const object={...parsed,
    generated_at:new Date(current-120000).toISOString(),
    expires_at:new Date(current+3600000).toISOString(),
    verification:{status:"VERIFIED",reason_codes:[],last_verified_at:new Date(current).toISOString()},
    commercial_eligibility:{status:"VERIFIED",reason_codes:[]}
  };
  const raw=JSON.stringify(object);
  expect(()=>validatedOwnerPrivateGRO(raw,current))
    .toThrow("DIRECT_SIGNED_GRO_D1_PUBLICATION_REFUSED");
 });
 it("denies unsigned, missing owner private attestation and arbitrary JSON",()=>{
  for(const raw of ["{}",'{"schema":"gro-1.1"}',JSON.stringify({
    schema:"geomacro.private-machine-commercial-prepared-gro.v1",
    country_iso3:"USA",canonical_signed_gro_json:sample,
    local_signature_verified:true,rights_policy_attested:false,
    machine_same_event_attested:true,record_sha256:"a".repeat(64)
  })])expect(()=>validatedOwnerPrivateGRO(raw,current)).toThrow();
 });
 it("no network or Supabase call without explicit release and free-quota guard",async()=>{
  await expect(promoteOwnerPrivateGRO("/absent/private.json",current))
    .rejects.toThrow("DIRECT_SIGNED_GRO_D1_PUBLICATION_REFUSED");
 });
 it("retains strict B2 verified readback before D1 hot/index writes",()=>{
  const src=readFileSync("scripts/ops/publish-private-signed-gro-d1.ts","utf8");
  expect(src).toContain("putWithMetadataVerification");
  expect(src.indexOf("putWithMetadataVerification")).toBeLessThan(src.indexOf("await cfQuery(account,id,token,[\n   {sql:hotSql"));
  expect(src).toContain("verifyCommercialRiskObjectArtifact");
  expect(src).toContain("pinnedRiskObjectVerificationKeys");
  expect(src).toContain("sha256(String(row.object_json))");
  expect(src).toContain("supabase_requests:0");
  expect(src).not.toContain("createGriDbClient");
  expect(src).not.toContain("requireRiskSupabase");
 });
});
