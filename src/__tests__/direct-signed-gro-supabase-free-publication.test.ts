import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {predgeRiskGateD1Readiness} from "../../workers/control-plane/src/predge-risk-gate-d1.mjs";
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

describe("D1 pinned public key without duplicate secret",()=>{
 const now=Date.parse("2026-10-20T16:00:00.000Z");
 const env={
   PREDGE_RISK_GATE_TOKEN:"f".repeat(64),
   PREDGE_RESEARCH_NEWS_TOKEN:"a".repeat(64),
   CONTROL_PLANE_TOKEN:"b".repeat(64),
   DB:{prepare:()=>({bind:()=>({first:async()=>null}),
     first:async()=>({healthy:1})})},
 };
 it("uses reviewed active pinned Ed25519 key even without private env duplicate",async()=>{
  const response=await predgeRiskGateD1Readiness(env,now);
  const body=await response.json();
  expect(response.status).toBe(503);
  expect(body.checks.active_pinned_verification_key).toBe(true);
  expect(body.checks.fresh_verified_commercial_country_gro).toBe(false);
  expect(body.paid_launch_approved).toBe(false);
  expect(body.execution_authorized).toBe(false);
 });
 it("denies inconsistent protected key registry rather than bypassing the pin",async()=>{
  const response=await predgeRiskGateD1Readiness({...env,
    RISK_GATE_VERIFY_KEYS_JSON:JSON.stringify({
     "geomacro-risk-2026-03":{status:"active",public_key_spki_b64:"wrong"}
    })},now);
  const body=await response.json();
  expect(body.checks.active_pinned_verification_key).toBe(false);
  expect(body.status).toBe("not_ready");
 });
});
